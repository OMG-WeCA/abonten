import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';

export const BRIEF_MAX_BYTES = 10 * 1024 * 1024;
export const BRIEF_MAX_CHARACTERS = 60000;
export const BRIEF_EXTENSIONS = ['pdf', 'pptx', 'xlsx', 'docx', 'txt', 'csv', 'tsv', 'md'] as const;
export type BriefFormat = (typeof BRIEF_EXTENSIONS)[number];
export interface ParsedBrief {
  text: string;
  warnings: string[];
}

export interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: readonly number[];
  hasEOL?: boolean;
}

/** Font changes can split contiguous words/numbers; only physical gaps add spaces. */
export function pdfText(items: readonly PdfTextItem[]): string {
  let text = '';
  let previous: PdfTextItem | undefined;
  for (const item of items) {
    if (previous && text && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const a = previous.transform;
      const b = item.transform;
      const scale = Math.hypot(a[0], a[1]);
      if (
        a.length >= 6 &&
        b.length >= 6 &&
        scale > 0 &&
        [...a, ...b, previous.width, previous.height, item.height].every(Number.isFinite)
      ) {
        const x = a[0] / scale;
        const y = a[1] / scale;
        const dx = b[4] - a[4];
        const dy = b[5] - a[5];
        const fontHeight = Math.max(previous.height, item.height, 1);
        const lineOffset = Math.abs(-dx * y + dy * x);
        const gap = dx * x + dy * y - previous.width;
        if (lineOffset > fontHeight * 0.5) text += '\n';
        else if (gap > Math.max(0.1, fontHeight * 0.05)) text += ' ';
      } else text += ' ';
    }
    text += item.str;
    if (item.hasEOL && !text.endsWith('\n')) text += '\n';
    previous = item;
  }
  return text;
}

function fail(message: string): never {
  throw new Error(message);
}

export function briefFormat(name: string): BriefFormat {
  const extension = name.split('.').pop()?.toLowerCase();
  if (!BRIEF_EXTENSIONS.includes(extension as BriefFormat))
    fail(
      'Use PDF, DOCX, PPTX, XLSX, TXT, CSV, TSV or Markdown. Legacy DOC, PPT and XLS files must be exported first.',
    );
  return extension as BriefFormat;
}

export function normalizeText(text: string): ParsedBrief {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- intentionally remove document control bytes
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  if (!normalized)
    fail(
      'No readable text found. Scanned documents need a text layer or a text export; OCR is unavailable.',
    );
  return {
    text: normalized.slice(0, BRIEF_MAX_CHARACTERS),
    warnings:
      normalized.length > BRIEF_MAX_CHARACTERS
        ? [
            'Text was truncated to 60,000 characters. Confirm that all planning requirements are included.',
          ]
        : [],
  };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** In-memory OOXML ZIP reader. No paths are written; no relationships are fetched. */
function zipEntries(buffer: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) fail('Invalid Office document archive.');
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    count !== buffer.readUInt16LE(end + 8) ||
    count > 1000 ||
    directoryOffset + directorySize !== end
  )
    fail('Multi-disk, ZIP64 or oversized Office archives are not supported.');
  const entries = new Map<string, Buffer>();
  let cursor = directoryOffset;
  let expandedBytes = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      fail('Invalid Office document directory.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const compression = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) fail('Invalid Office archive entry.');
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (
      entries.has(name) ||
      name.includes('..') ||
      name.includes('\\') ||
      name.startsWith('/') ||
      /vbaProject|\/embeddings\/|activeX/i.test(name)
    )
      fail('Unsafe archive paths, macros or embedded active objects are not accepted.');
    expandedBytes += size;
    if (
      flags & 1 ||
      ![0, 8].includes(compression) ||
      size > 4 * 1024 * 1024 ||
      expandedBytes > 32 * 1024 * 1024 ||
      size > Math.max(1, compressedSize) * 200
    )
      fail('Encrypted or excessively compressed Office documents are not accepted.');
    if (localOffset + 30 > directoryOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50)
      fail('Invalid Office local entry.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const dataStart = localOffset + 30 + localNameLength + buffer.readUInt16LE(localOffset + 28);
    if (
      buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8') !==
        name ||
      buffer.readUInt16LE(localOffset + 8) !== compression ||
      dataStart + compressedSize > directoryOffset
    )
      fail('Inconsistent Office archive entry.');
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const bytes =
      compression === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (bytes.length !== size || crc32(bytes) !== crc) fail('Corrupt Office archive entry.');
    entries.set(name, bytes);
    cursor = next;
  }
  if (cursor !== end) fail('Invalid Office archive directory size.');
  return entries;
}

function xml(bytes: Buffer | undefined): string {
  if (!bytes) fail('The file does not match its Office document format.');
  const value = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(value))
    fail('XML declarations with external entities are not accepted.');
  return value;
}

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };
    if (named[entity]) return named[entity];
    const number = entity.startsWith('&#x')
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number.parseInt(entity.slice(2, -1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
  });
}

function textTags(value: string): string {
  const structuralText = value.replace(
    /<(?:w|a):(tab|br|cr)(?:\s[^>]*)?\s*\/>/g,
    (_tag, kind: string) => `<t>${kind === 'tab' ? '\t' : '\n'}</t>`,
  );
  return [...structuralText.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function paragraphText(value: string, prefix: 'w' | 'a'): string {
  return value
    .split(new RegExp(`</${prefix}:p>`))
    .map(textTags)
    .join('\n');
}

function xmlAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of value.matchAll(pattern)) {
    if (Object.hasOwn(attributes, match[1])) fail('Malformed Office relationship attributes.');
    attributes[match[1]] = decodeXml(match[2] ?? match[3]);
  }
  if (value.replace(pattern, '').trim()) fail('Malformed Office relationship attributes.');
  return attributes;
}

interface OrderedOfficePart {
  path: string;
  name: string | null;
}

/** Package filenames do not define the displayed slide or worksheet order. */
function orderedParts(entries: Map<string, Buffer>, format: 'pptx' | 'xlsx'): OrderedOfficePart[] {
  const powerpoint = format === 'pptx';
  const label = powerpoint ? 'PowerPoint slide' : 'Excel worksheet';
  const directory = powerpoint ? 'ppt' : 'xl';
  const documentName = powerpoint ? 'presentation.xml' : 'workbook.xml';
  const listTag = powerpoint ? 'sldIdLst' : 'sheets';
  const itemTag = powerpoint ? 'sldId' : 'sheet';
  const type = powerpoint ? 'slide' : 'worksheet';
  const partDirectory = powerpoint ? 'slides' : 'worksheets';
  const document = xml(entries.get(`${directory}/${documentName}`));
  const relationshipBytes = entries.get(`${directory}/_rels/${documentName}.rels`);
  if (!relationshipBytes) fail(`${label} relationships are missing. Export the document again.`);
  const relationships = xml(relationshipBytes);
  if (
    !/<(?:\w+:)?Relationships\b/.test(relationships) ||
    !/<\/(?:\w+:)?Relationships>/.test(relationships)
  )
    fail(`Malformed ${label} relationships. Export the document again.`);
  const targets = new Map<string, Record<string, string>>();
  const relationshipPattern =
    /<(?:\w+:)?Relationship\b([^>]*?)(?:\s*\/>|>\s*<\/(?:\w+:)?Relationship>)/g;
  for (const match of relationships.matchAll(relationshipPattern)) {
    const attributes = xmlAttributes(match[1]);
    if (!attributes.Id || !attributes.Target || !attributes.Type || targets.has(attributes.Id))
      fail(`Malformed or duplicate ${label} relationships.`);
    targets.set(attributes.Id, attributes);
  }
  // Reject malformed or non-empty definitions rather than silently skipping them.
  const declared = [...relationships.matchAll(/<(?:\w+:)?Relationship\b/g)].length;
  if (declared !== targets.size) fail(`Malformed ${label} relationships.`);
  const itemList = new RegExp(
    `<(?:\\w+:)?${listTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${listTag}>`,
  ).exec(document)?.[1];
  if (!itemList) fail(`${label} order is missing. Export the document again.`);
  const parts: OrderedOfficePart[] = [];
  const seen = new Set<string>();
  const itemPattern = new RegExp(
    `<(?:\\w+:)?${itemTag}\\b([^>]*?)(?:\\s*\\/>|>\\s*<\\/(?:\\w+:)?${itemTag}>)`,
    'g',
  );
  for (const match of itemList.matchAll(itemPattern)) {
    const attributes = xmlAttributes(match[1]);
    const relationshipId = attributes['r:id'];
    const relationship = targets.get(relationshipId);
    if (!relationshipId || !relationship || seen.has(relationshipId))
      fail(`${label} order references a missing or duplicate relationship.`);
    if (relationship.TargetMode && relationship.TargetMode !== 'Internal')
      fail(`External ${label} relationships are not accepted.`);
    if (
      ![
        `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}`,
        `http://purl.oclc.org/ooxml/officeDocument/relationships/${type}`,
      ].includes(relationship.Type)
    )
      fail(`${label} order references an invalid relationship type.`);
    const target = relationship.Target;
    if (
      target.includes('\\') ||
      target.split('/').includes('..') ||
      /[:?#%]/.test(target) ||
      target.startsWith('//')
    )
      fail(`Unsafe ${label} relationship target.`);
    const path = posix.normalize(
      target.startsWith('/') ? target.slice(1) : `${directory}/${target}`,
    );
    if (
      !new RegExp(`^${directory}/${partDirectory}/[\\w.-]+\\.xml$`).test(path) ||
      !entries.has(path)
    )
      fail(`${label} relationship target is missing or unsafe.`);
    if (!powerpoint && !attributes.name)
      fail('Excel worksheet name is missing. Export the workbook again.');
    seen.add(relationshipId);
    parts.push({ path, name: powerpoint ? null : attributes.name });
  }
  if (
    !parts.length ||
    [...itemList.matchAll(new RegExp(`<(?:\\w+:)?${itemTag}\\b`, 'g'))].length !== parts.length
  )
    fail(`Malformed ${label} order.`);
  if (parts.length > (powerpoint ? 100 : 50))
    fail(
      powerpoint
        ? 'Limit PowerPoint briefs to 100 slides.'
        : 'Limit Excel briefs to 50 worksheets.',
    );
  return parts;
}

export function parseOffice(buffer: Buffer, format: 'docx' | 'pptx' | 'xlsx'): ParsedBrief {
  const entries = zipEntries(buffer);
  xml(entries.get('[Content_Types].xml'));
  const warnings = [
    'Only document text and stored spreadsheet values are extracted. Images, charts, formulas, macros and external links are never executed or fetched. Confirm the brief before applying it.',
  ];
  let text: string;
  if (format === 'docx') {
    const document = xml(entries.get('word/document.xml'));
    text = paragraphText(document, 'w');
  } else if (format === 'pptx') {
    const slides = orderedParts(entries, 'pptx');
    const slideText = slides.map((slide) =>
      paragraphText(xml(entries.get(slide.path)), 'a').trim(),
    );
    if (!slideText.some((value) => value.trim()))
      fail('No readable slide text found. Image-only presentations need a text export.');
    text = slideText.map((value, index) => `Slide ${index + 1}\n${value}`).join('\n\n');
  } else {
    const sheets = orderedParts(entries, 'xlsx');
    const shared = entries.has('xl/sharedStrings.xml')
      ? [
          ...xml(entries.get('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g),
        ].map((match) => textTags(match[1]))
      : [];
    const sheetText = sheets.map((sheet) => {
      const rows = [
        ...xml(entries.get(sheet.path)).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g),
      ];
      return rows
        .map((row) =>
          [...row[1].matchAll(/<c(\s[^>]*)?>([\s\S]*?)<\/c>/g)]
            .map((cell) => {
              const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1];
              if (/\bt="s"/.test(cell[1] ?? '')) return shared[Number(value)] ?? '';
              return value === undefined ? textTags(cell[2]) : decodeXml(value);
            })
            .join('\t'),
        )
        .join('\n');
    });
    if (!sheetText.some((value) => value.trim()))
      fail('No readable spreadsheet cells found. Charts and images need a text export.');
    text = sheetText
      .map((value, index) => `Worksheet ${index + 1}: ${sheets[index].name}\n${value}`)
      .join('\n\n');
  }
  const normalized = normalizeText(text);
  return { ...normalized, warnings: [...warnings, ...normalized.warnings] };
}

export function parseText(buffer: Buffer): ParsedBrief {
  let decoded: string;
  if (buffer[0] === 0xff && buffer[1] === 0xfe)
    decoded = new TextDecoder('utf-16le', { fatal: true }).decode(buffer.subarray(2));
  else if (buffer[0] === 0xfe && buffer[1] === 0xff)
    decoded = new TextDecoder('utf-16be', { fatal: true }).decode(buffer.subarray(2));
  else decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  // eslint-disable-next-line no-control-regex -- intentionally reject binary input masquerading as text
  if (/[\u0000-\u0008\u000e-\u001f]/.test(decoded))
    fail('A plain-text brief must contain readable UTF-8 or UTF-16 text.');
  return normalizeText(decoded);
}
