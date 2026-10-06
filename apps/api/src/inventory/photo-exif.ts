/** A deliberately small, inert TIFF/EXIF reader. No maker notes, XML, scripts,
 * thumbnails, pointers outside the EXIF block or device identifiers are read.
 * EXIF is partner-controlled evidence, not independent verification. */
export interface ExtractedPhotoExif {
  gps?: { latitude: number; longitude: number };
  capturedAt?: string;
  localCapturedAt?: string;
  warnings: string[];
}

type Entry = { type: number; count: number; data: Buffer };
const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function extractPhotoExif(raw?: Buffer): ExtractedPhotoExif {
  const result: ExtractedPhotoExif = { warnings: [] };
  if (!raw?.length) return result;
  try {
    const b = raw.subarray(raw.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0);
    if (b.length > 256 * 1024 || b.length < 8) throw new Error('EXIF size');
    const little = b.toString('ascii', 0, 2) === 'II';
    if (!little && b.toString('ascii', 0, 2) !== 'MM') throw new Error('TIFF byte order');
    const u16 = (offset: number) => (little ? b.readUInt16LE(offset) : b.readUInt16BE(offset));
    const u32 = (offset: number) => (little ? b.readUInt32LE(offset) : b.readUInt32BE(offset));
    if (u16(2) !== 42) throw new Error('TIFF marker');
    const ifd = (offset: number): Map<number, Entry> => {
      if (offset < 8 || offset + 2 > b.length) throw new Error('IFD offset');
      const count = u16(offset);
      if (count > 128 || offset + 2 + count * 12 + 4 > b.length) throw new Error('IFD bounds');
      const entries = new Map<number, Entry>();
      for (let i = 0; i < count; i++) {
        const at = offset + 2 + i * 12;
        const type = u16(at + 2),
          n = u32(at + 4),
          size = sizes[type];
        if (!size || n > 1024) continue;
        const bytes = n * size;
        const start = bytes <= 4 ? at + 8 : u32(at + 8);
        if (start < 0 || start + bytes > b.length) throw new Error('EXIF value bounds');
        entries.set(u16(at), { type, count: n, data: b.subarray(start, start + bytes) });
      }
      return entries;
    };
    const integer = (entry?: Entry): number | undefined =>
      entry?.type === 4 && entry.count === 1
        ? little
          ? entry.data.readUInt32LE(0)
          : entry.data.readUInt32BE(0)
        : undefined;
    const ascii = (entry?: Entry): string | undefined =>
      entry?.type === 2 ? entry.data.toString('ascii').replace(/\0.*$/s, '').trim() : undefined;
    const rationals = (entry?: Entry): number[] | undefined => {
      if (!entry || entry.type !== 5 || entry.count > 3) return undefined;
      const values: number[] = [];
      for (let i = 0; i < entry.count; i++) {
        const num = little ? entry.data.readUInt32LE(i * 8) : entry.data.readUInt32BE(i * 8);
        const den = little
          ? entry.data.readUInt32LE(i * 8 + 4)
          : entry.data.readUInt32BE(i * 8 + 4);
        if (den === 0) return undefined;
        values.push(num / den);
      }
      return values;
    };
    const root = ifd(u32(4));
    const gpsOffset = integer(root.get(0x8825));
    if (gpsOffset) {
      const gps = ifd(gpsOffset);
      const lat = rationals(gps.get(2)),
        lon = rationals(gps.get(4));
      const latRef = ascii(gps.get(1)),
        lonRef = ascii(gps.get(3));
      const coord = (v: number[], max: number) =>
        v.length === 3 && v[0]! <= max && v[1]! < 60 && v[2]! < 60
          ? v[0]! + v[1]! / 60 + v[2]! / 3600
          : NaN;
      if (lat && lon && ['N', 'S'].includes(latRef ?? '') && ['E', 'W'].includes(lonRef ?? '')) {
        const latitude = coord(lat, 90) * (latRef === 'S' ? -1 : 1);
        const longitude = coord(lon, 180) * (lonRef === 'W' ? -1 : 1);
        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 &&
          Math.abs(longitude) <= 180
        ) {
          result.gps = { latitude, longitude };
        }
      }
      const date = ascii(gps.get(29)),
        time = rationals(gps.get(7));
      if (
        date &&
        time?.length === 3 &&
        /^\d{4}:\d{2}:\d{2}$/.test(date) &&
        time[0]! < 24 &&
        time[1]! < 60 &&
        time[2]! < 60
      ) {
        const value = `${date.replace(/:/g, '-')}T${time.map((n) => Math.floor(n).toString().padStart(2, '0')).join(':')}Z`;
        if (validExifTime(value)) result.capturedAt = new Date(value).toISOString();
      }
    }
    const exifOffset = integer(root.get(0x8769));
    const exif = exifOffset ? ifd(exifOffset) : root;
    const local = ascii(exif.get(0x9003)) ?? ascii(root.get(0x0132));
    if (local && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(local)) {
      const date = `${local.slice(0, 10).replace(/:/g, '-')}T${local.slice(11)}`;
      if (validExifTime(`${date}Z`)) {
        result.localCapturedAt = date;
        const offset = ascii(exif.get(0x9011));
        if (!result.capturedAt && offset && /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)) {
          result.capturedAt = new Date(`${date}${offset}`).toISOString();
        }
        if (!result.capturedAt)
          result.warnings.push('EXIF capture time has no timezone; confirm the capture date.');
      }
    }
    if (result.capturedAt && new Date(result.capturedAt).getTime() > Date.now() + 5 * 60_000) {
      result.warnings.push('EXIF capture time is in the future and was not accepted.');
      delete result.capturedAt;
    }
  } catch {
    result.warnings.push(
      'Embedded EXIF metadata could not be read; the photo was decoded separately.',
    );
  }
  return result;
}

function validExifTime(value: string): boolean {
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
