import { BadRequestException, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { briefFormat, BRIEF_MAX_BYTES, type ParsedBrief } from './brief-parser';
import { extractConstraints } from './brief-constraints';

// Trusted static program. Uploaded bytes arrive exclusively on stdin. Each parse
// has an independent heap/time limit and receives no credentials/environment.
const PARSER_PROGRAM = String.raw`
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const parser = require(process.argv[1]);
const format = process.argv[3];
console.log = console.warn = console.error = () => {};
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  let result;
  if (format === 'pdf') {
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('The file does not contain a PDF document.');
    const pdfjs = await import(pathToFileURL(process.argv[2]).href);
    const task = pdfjs.getDocument({data: Uint8Array.from(bytes), isEvalSupported: false, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, maxImageSize: 0, verbosity: 0});
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw new Error('Limit PDF briefs to 100 pages.');
      let text = '';
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        text += parser.pdfText(content.items.filter(item => typeof item.str === 'string')) + '\n';
        if (text.length > parser.BRIEF_MAX_CHARACTERS) break;
      }
      result = parser.normalizeText(text);
      result.warnings.unshift('PDF text order can differ from its layout. Scanned images are not OCR-processed. Confirm the extracted brief.');
    } finally { await task.destroy(); }
  } else if (['docx', 'pptx', 'xlsx'].includes(format)) result = parser.parseOffice(bytes, format);
  else result = parser.parseText(bytes);
  process.stdout.write(JSON.stringify({result}));
} catch (error) {
  process.stdout.write(JSON.stringify({error: error && error.name === 'PasswordException' ? 'Password-protected documents are not supported.' : (error.message || 'Document extraction failed.')}));
}
`;

@Injectable()
export class BriefExtractionService {
  private active = 0;

  async extract(file: Pick<Express.Multer.File, 'buffer' | 'originalname'>) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a non-empty document to upload.');
    if (file.buffer.length > BRIEF_MAX_BYTES)
      throw new HttpException('Briefs must be 10 MB or smaller.', HttpStatus.PAYLOAD_TOO_LARGE);
    let format;
    try {
      format = briefFormat(file.originalname);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    if (this.active >= 2)
      throw new HttpException(
        'Document extraction is busy. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.active++;
    try {
      const result = await this.run(file.buffer, format);
      return {
        ...result,
        fileName: file.originalname
          .split(/[\\/]/)
          .pop()!
          // eslint-disable-next-line no-control-regex -- remove unsafe filename control characters
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .slice(0, 200),
        format,
        characters: result.text.length,
        constraints: extractConstraints(result.text),
        requiresConfirmation: true as const,
        retained: false as const,
      };
    } finally {
      this.active--;
    }
  }

  private run(buffer: Buffer, format: string): Promise<ParsedBrief> {
    return new Promise((resolve, reject) => {
      const parserPath = join(__dirname, 'brief-parser.js');
      const pdfPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=256',
          '--disable-proto=throw',
          '--input-type=module',
          '-e',
          PARSER_PROGRAM,
          parserPath,
          pdfPath,
          format,
        ],
        {
          env: {},
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let complete = false;
      const finish = (result?: ParsedBrief, error?: string) => {
        if (complete) return;
        complete = true;
        clearTimeout(deadline);
        child.kill('SIGKILL');
        if (error || !result)
          reject(
            new BadRequestException(error ?? 'Document extraction failed. Try a text export.'),
          );
        else resolve(result);
      };
      const deadline = setTimeout(
        () =>
          finish(
            undefined,
            'Document extraction timed out. Try a smaller document or text export.',
          ),
        15000,
      );
      // Streaming decoding preserves multibyte UTF-8 across pipe chunk boundaries.
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        output += chunk;
        if (output.length > 512000)
          finish(undefined, 'Document text exceeded the extraction limit.');
      });
      // Drain diagnostics, which can contain document contents; do not log them.
      child.stderr.on('data', () => {});
      child.stdin.on('error', () => {});
      child.on('error', () => finish(undefined, 'Document extraction is temporarily unavailable.'));
      child.on('close', (code) => {
        if (code !== 0)
          return finish(undefined, 'Document could not be safely extracted. Try a text export.');
        try {
          const decoded = JSON.parse(output) as { result?: ParsedBrief; error?: string };
          finish(decoded.result, decoded.error);
        } catch {
          finish(undefined, 'Document could not be safely extracted. Try a text export.');
        }
      });
      child.stdin.end(buffer);
    });
  }
}
