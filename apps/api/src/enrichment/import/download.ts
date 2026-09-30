import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { configuredSource, type SourceConfiguration } from '../registry';
import { record } from './geometry';
import { requiredString } from './manifest';
export function isRegisteredUrl(value: string, source: SourceConfiguration): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== '443')
  )
    return false;
  return source.allowedUrlPrefixes.some((prefix) =>
    prefix.endsWith('/') ? url.href.startsWith(prefix) : url.href === prefix,
  );
}
async function requestRegistered(
  url: string,
  source: SourceConfiguration,
  signal: AbortSignal,
): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!isRegisteredUrl(current, source))
      throw new Error('URL is outside the registered official source allowlist');
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'Abonten-enrichment-import/1.0' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Source redirect has no Location');
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`Official source returned HTTP ${response.status}`);
    }
    return response;
  }
  throw new Error('Official source exceeded redirect limit');
}
async function readBounded(response: Response, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Source response exceeds size limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export async function downloadRegisteredSource(
  countryCode: string,
  sourceKey: string,
  outputPath: string,
): Promise<{
  path: string;
  checksum: string;
  bytes: number;
  fetchedAt: string;
  sourceUrl: string;
  metadata?: Record<string, unknown>;
}> {
  const source = configuredSource(countryCode, sourceKey);
  if (!source?.url)
    throw new Error('Source has no registered downloadable URL; supply a local file');
  const signal = AbortSignal.timeout(60 * 60_000);
  let url = source.url;
  let metadata: Record<string, unknown> | undefined;
  if (sourceKey.startsWith('geoboundaries-')) {
    const result = await requestRegistered(url, source, signal);
    metadata = record(
      JSON.parse((await readBounded(result, 2 * 1024 * 1024)).toString('utf8')),
      'geoBoundaries metadata',
    );
    // Current API returns one object, not an array. Do not infer a licence/year from another ADM level.
    url = requiredString(metadata.gjDownloadURL, 'geoBoundaries gjDownloadURL', 2048);
  }
  const response = await requestRegistered(url, source, signal);
  const maximum = 2 * 1024 ** 3;
  const length = Number(response.headers.get('content-length'));
  if (length > maximum) {
    await response.body!.cancel();
    throw new Error('Source exceeds 2 GiB download limit');
  }
  const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o640 });
  let streamError: Error | undefined;
  output.on('error', (error) => {
    streamError = error;
  });
  let created = false;
  let bytes = 0;
  const hash = createHash('sha256');
  const reader = response.body!.getReader();
  try {
    await once(output, 'open');
    created = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (streamError) throw streamError;
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new Error('Source exceeds 2 GiB download limit');
      hash.update(value);
      if (!output.write(value)) await once(output, 'drain');
    }
    if (streamError) throw streamError;
    const finished = once(output, 'finish');
    output.end();
    await finished;
    if (bytes === 0) throw new Error('Official source returned an empty file');
    return {
      path: outputPath,
      checksum: hash.digest('hex'),
      bytes,
      fetchedAt: new Date().toISOString(),
      sourceUrl: url,
      ...(metadata ? { metadata } : {}),
    };
  } catch (error) {
    output.destroy();
    if (created) await rm(outputPath, { force: true });
    throw error;
  } finally {
    await reader.cancel();
  }
}
