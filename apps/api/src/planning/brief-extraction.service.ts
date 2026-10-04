import { BadRequestException, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

export interface BriefAdmission {
  readonly id: symbol;
}
interface AdmissionState {
  consumed: boolean;
  workerRunning: boolean;
}

@Injectable()
export class BriefExtractionService {
  private active = 0;
  private readonly admissions = new WeakMap<BriefAdmission, AdmissionState>();

  /** HTTP callers reserve before Multer buffers a body; direct callers use the
   * same bound. Tokens belong to this service instance and cannot be reused. */
  reserve(): BriefAdmission {
    if (this.active >= 2)
      throw new HttpException(
        'Document extraction is busy. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const admission = Object.freeze({ id: Symbol('brief-admission') });
    this.admissions.set(admission, { consumed: false, workerRunning: false });
    this.active++;
    return admission;
  }

  /** Idempotent. A cancelled parser retains its slot until the process closes. */
  release(admission: BriefAdmission): void {
    const state = this.admissions.get(admission);
    if (!state || state.workerRunning) return;
    this.admissions.delete(admission);
    this.active--;
  }

  async extract(
    file: Pick<Express.Multer.File, 'buffer' | 'originalname'>,
    admission?: BriefAdmission,
    signal?: AbortSignal,
  ) {
    const token = admission ?? this.reserve();
    const state = this.admissions.get(token);
    if (!state || state.consumed)
      throw new BadRequestException('Document admission has expired. Retry the upload manually.');
    state.consumed = true;
    try {
      if (signal?.aborted) throw this.cancelled();
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
      const result = await this.run(file.buffer, format, state, signal);
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
      // run settles only on child close, including abort and deadline failures.
      state.workerRunning = false;
      this.release(token);
    }
  }

  private cancelled() {
    return new HttpException('Document extraction cancelled. Retry the upload manually.', 499);
  }

  /** Protected solely to exercise process lifecycle with inert test workers. */
  protected spawnParser(format: string): ChildProcessWithoutNullStreams {
    return spawn(
      process.execPath,
      [
        '--max-old-space-size=256',
        '--disable-proto=throw',
        '--input-type=module',
        '-e',
        PARSER_PROGRAM,
        join(__dirname, 'brief-parser.js'),
        require.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
        format,
      ],
      { env: {}, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }

  private run(
    buffer: Buffer,
    format: string,
    state: AdmissionState,
    signal?: AbortSignal,
  ): Promise<ParsedBrief> {
    return new Promise((resolve, reject) => {
      const child = this.spawnParser(format);
      state.workerRunning = true;
      let output = '';
      let failure: HttpException | undefined;
      let closed = false;
      const stop = (error: HttpException) => {
        if (closed || failure) return;
        failure = error;
        // Do not settle or release capacity here: SIGKILL is a request, and
        // descriptor/process cleanup is established by the close event.
        child.kill('SIGKILL');
      };
      const cancel = () => stop(this.cancelled());
      const deadline = setTimeout(
        () =>
          stop(
            new BadRequestException(
              'Document extraction timed out. Try a smaller document or text export.',
            ),
          ),
        15000,
      );
      signal?.addEventListener('abort', cancel, { once: true });
      // Streaming decoding preserves multibyte UTF-8 across pipe chunk boundaries.
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (failure) return;
        output += chunk;
        if (output.length > 512000)
          stop(new BadRequestException('Document text exceeded the extraction limit.'));
      });
      // Drain diagnostics, which can contain document contents; do not log them.
      child.stderr.on('data', () => {});
      child.stdin.on('error', () => {});
      child.on('error', () =>
        stop(new BadRequestException('Document extraction is temporarily unavailable.')),
      );
      child.once('close', (code) => {
        closed = true;
        clearTimeout(deadline);
        signal?.removeEventListener('abort', cancel);
        if (failure) return reject(failure);
        if (code !== 0)
          return reject(
            new BadRequestException('Document could not be safely extracted. Try a text export.'),
          );
        try {
          const decoded = JSON.parse(output) as { result?: ParsedBrief; error?: string };
          if (decoded.error || !decoded.result)
            return reject(
              new BadRequestException(
                decoded.error ?? 'Document extraction failed. Try a text export.',
              ),
            );
          resolve(decoded.result);
        } catch {
          reject(
            new BadRequestException('Document could not be safely extracted. Try a text export.'),
          );
        }
      });
      if (signal?.aborted) cancel();
      if (!failure) child.stdin.end(buffer);
    });
  }
}
