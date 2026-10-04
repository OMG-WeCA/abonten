import { constants, createReadStream } from 'node:fs';
import { copyFile, chmod, mkdir, realpath, stat, link, unlink, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve, dirname, basename } from 'node:path';
import { bboxPolygon, record, validateBounds, type Polygon } from './geometry';
import type { Bounds } from '../registry';
import { runTool } from './process';
export interface PopulationRasterInfo {
  width: number;
  height: number;
  originX: number;
  originY: number;
  pixelWidth: number;
  pixelHeight: number;
  noData: number;
  bounds: Bounds;
  originalCrs: 'EPSG:4326';
}
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function enrichmentDataDirectory(): string {
  return resolve(process.env.ENRICHMENT_DATA_DIR ?? join(process.cwd(), 'var', 'enrichment'));
}
/** Single-file imports must not silently discard validity/georeferencing sidecars. */
export async function assertNoRasterSidecars(path: string): Promise<void> {
  const absolute = resolve(path);
  const resolved = await realpath(absolute);
  for (const file of new Set([absolute, resolved])) {
    const name = basename(file).toLowerCase();
    const stem = name.replace(/\.(tiff?|geotiff)$/, '');
    const forbidden = new Set([
      `${name}.msk`,
      `${name}.aux.xml`,
      `${name}.aux`,
      `${stem}.aux.xml`,
      `${stem}.aux`,
    ]);
    const names = await readdir(dirname(file));
    const sidecar = names.find((entry) => forbidden.has(entry.toLowerCase()));
    if (sidecar)
      throw new Error(
        `Population raster has unsupported validity/metadata sidecar ${sidecar}; consolidate mask, NoData and metadata into a standalone GeoTIFF first`,
      );
  }
}
export async function inspectPopulationRaster(
  path: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PopulationRasterInfo> {
  const absolute = resolve(path);
  await assertNoRasterSidecars(absolute);
  const file = await stat(absolute);
  if (!file.isFile() || file.size > 2 * 1024 ** 3)
    throw new Error('Population raster must be a regular local GeoTIFF no larger than 2 GiB');
  const info = record(
    JSON.parse(
      await runTool(
        'gdalinfo',
        ['-json', '-if', 'GTiff', absolute],
        4 * 1024 * 1024,
        options.timeoutMs ?? 30_000,
        options.signal,
      ),
    ),
    'gdalinfo',
  );
  if (info.driverShortName !== 'GTiff')
    throw new Error('Population input must be a GeoTIFF/BigTIFF, never a VRT or remote dataset');
  const system = record(info.coordinateSystem, 'raster coordinateSystem');
  if (typeof system.wkt !== 'string' || !/ID\["EPSG",\s*4326\]\s*\]$/.test(system.wkt.trim()))
    throw new Error('Population raster must use EPSG:4326');
  const size = info.size,
    transform = info.geoTransform,
    bands = info.bands;
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    size.some((v) => !Number.isSafeInteger(v) || v <= 0)
  )
    throw new Error('Invalid raster dimensions');
  if (
    !Array.isArray(transform) ||
    transform.length !== 6 ||
    transform.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
    transform[1] <= 0 ||
    transform[5] >= 0 ||
    transform[2] !== 0 ||
    transform[4] !== 0
  )
    throw new Error('Population grid must be unrotated north-up WGS84');
  if (!Array.isArray(bands) || bands.length !== 1)
    throw new Error('Population raster must have exactly one band');
  const band = record(bands[0], 'raster band');
  if (typeof band.noDataValue !== 'number' || !Number.isFinite(band.noDataValue))
    throw new Error('Population raster requires an explicit finite NoData value');
  if (
    (band.scale !== undefined && band.scale !== 1) ||
    (band.offset !== undefined && band.offset !== 0)
  )
    throw new Error('Scaled population bands must be decoded before import');
  if (band.mask !== undefined) {
    const mask = record(band.mask, 'raster mask');
    if (Array.isArray(mask.flags) && mask.flags.some((f) => f !== 'NODATA' && f !== 'ALL_VALID'))
      throw new Error(
        'External/alpha raster masks are unsupported; encode missing cells as NoData',
      );
  }
  const bounds = validateBounds([
    transform[0],
    transform[3] + size[1] * transform[5],
    transform[0] + size[0] * transform[1],
    transform[3],
  ]);
  return {
    width: size[0],
    height: size[1],
    originX: transform[0],
    originY: transform[3],
    pixelWidth: transform[1],
    pixelHeight: -transform[5],
    noData: band.noDataValue,
    bounds,
    originalCrs: 'EPSG:4326',
  };
}
/** Copy before activation so an operator's temporary path cannot disappear or change underneath reads. */
export async function preservePopulationRaster(
  inputPath: string,
  expectedChecksum: string,
): Promise<string> {
  await assertNoRasterSidecars(inputPath);
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) throw new Error('Invalid raster checksum');
  const dir = enrichmentDataDirectory();
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const target = join(await realpath(dir), `${expectedChecksum}.tif`);
  await publishImmutableFile(resolve(inputPath), target, expectedChecksum);
  await assertNoRasterSidecars(inputPath);
  return target;
}
/** Publish by atomic hard-link so concurrent imports never observe a partially copied file. */
export async function publishImmutableFile(
  input: string,
  target: string,
  checksum: string,
): Promise<void> {
  const staging = `${target}.staging-${randomUUID()}`;
  try {
    await copyFile(input, staging, constants.COPYFILE_EXCL);
    if ((await sha256File(staging)) !== checksum)
      throw new Error('Copied raw artifact does not match manifest checksum');
    await chmod(staging, 0o440);
    try {
      await link(staging, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if ((await sha256File(target)) !== checksum)
      throw new Error('Stored raw artifact does not match manifest checksum');
  } finally {
    await unlink(staging).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
export interface PopulationCells {
  cells: { value: number | null; geometry: Polygon }[];
  pixelSizeMetres?: number;
  warnings: string[];
}
let running = 0;
const waiting: (() => void)[] = [];
export async function rasterSlot<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new Error('Population query cancelled');
  if (running >= 2) {
    if (waiting.length >= 8)
      throw new Error('Population raster query capacity reached; retry later');
    await new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const cancel = () => {
        const index = waiting.indexOf(enter);
        if (index >= 0) waiting.splice(index, 1);
        signal?.removeEventListener('abort', cancel);
        reject(new Error('Population query cancelled'));
      };
      waiting.push(enter);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  } else running++;
  try {
    if (signal?.aborted) throw new Error('Population query cancelled');
    return await action();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
/** Never resamples people-per-pixel values. Caller intersects each native cell geodesically. */
export async function readPopulationCells(
  path: string,
  bbox: Bounds,
  options: { maxCells?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PopulationCells> {
  const query = validateBounds(bbox);
  const maxCells = options.maxCells ?? 10_000;
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 100_000)
    throw new Error('maxCells must be between 1 and 100000');
  if (!isAbsolute(path) || !/^[a-f0-9]{64}\.tif$/.test(path.split('/').pop() ?? ''))
    throw new Error('Raster is not a managed content-addressed file');
  const root = await realpath(enrichmentDataDirectory());
  const safePath = await realpath(path);
  if (dirname(safePath) !== root) throw new Error('Raster path is outside ENRICHMENT_DATA_DIR');
  return rasterSlot(async () => {
    if (options.signal?.aborted) throw new Error('Population query cancelled');
    const info = await inspectPopulationRaster(safePath, options);
    const [w, s, e, n] = query;
    const x0 = Math.max(0, Math.min(info.width, Math.floor((w - info.originX) / info.pixelWidth)));
    const x1 = Math.max(0, Math.min(info.width, Math.ceil((e - info.originX) / info.pixelWidth)));
    const y0 = Math.max(
      0,
      Math.min(info.height, Math.floor((info.originY - n) / info.pixelHeight)),
    );
    const y1 = Math.max(0, Math.min(info.height, Math.ceil((info.originY - s) / info.pixelHeight)));
    const width = x1 - x0,
      height = y1 - y0;
    const warnings: string[] = [];
    if (w < info.bounds[0] || s < info.bounds[1] || e > info.bounds[2] || n > info.bounds[3])
      warnings.push('Query extends beyond raster extent; uncovered area is unknown');
    if (width <= 0 || height <= 0)
      return { cells: [], warnings: [...warnings, 'No overlapping raster cells'] };
    if (width * height > maxCells)
      throw new Error(`Population query exceeds ${maxCells} native cells; use a smaller radius`);
    const output = await runTool(
      'gdal_translate',
      [
        '-q',
        '-if',
        'GTiff',
        '-of',
        'XYZ',
        '-b',
        '1',
        '-srcwin',
        String(x0),
        String(y0),
        String(width),
        String(height),
        safePath,
        '/vsistdout/',
      ],
      maxCells * 160 + 4096,
      options.timeoutMs ?? 30_000,
      options.signal,
    );
    const lines = output.trim().split(/\r?\n/);
    if (lines.length !== width * height)
      throw new Error('GDAL returned an incomplete raster window');
    let noDataCount = 0;
    const cells = lines.map((line, i) => {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 3) throw new Error('Invalid GDAL XYZ output');
      const value = Number(fields[2]);
      if (!Number.isFinite(value)) throw new Error('Population cell is not finite');
      const isMissing = value === info.noData;
      if (!isMissing && value < 0) throw new Error('Population cell is negative and not NoData');
      if (isMissing) noDataCount++;
      const west = info.originX + (x0 + (i % width)) * info.pixelWidth;
      const north = info.originY - (y0 + Math.floor(i / width)) * info.pixelHeight;
      return {
        value: isMissing ? null : value,
        geometry: bboxPolygon([west, north - info.pixelHeight, west + info.pixelWidth, north]),
      };
    });
    if (noDataCount)
      warnings.push(
        `${noDataCount} native raster cells contain NoData and are excluded, not counted as zero`,
      );
    // Nominal north-south resolution, clearly approximate; cell areas are not derived from this.
    return { cells, pixelSizeMetres: info.pixelHeight * 111_195, warnings };
  }, options.signal);
}
