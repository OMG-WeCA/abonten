import 'reflect-metadata';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { countries, configuredSource } from '../registry';
import { downloadRegisteredSource } from './download';
import { importDataset } from './importer';
import { AppDataSource } from '../../data-source';
function flags(args: string[], allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!allowed.includes(key) || !args[i + 1] || args[i + 1].startsWith('--') || result[key])
      throw new Error(`Invalid, missing, or duplicate option: ${key}`);
    result[key] = args[i + 1];
  }
  return result;
}
function need(options: Record<string, string>, name: string): string {
  if (!options[name]) throw new Error(`Required option: ${name}`);
  return options[name];
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(
      `Operator enrichment import (SPEC §5.2, V1)\n\nCommands:\n  sources\n  download --country GH --source worldpop-r2025a-2026 --output /data/gha.tif\n  import --input /data/gha.tif --manifest /data/gha.manifest.json --operator your-operator-id\n\nDownloads accept only registered official URLs; imports never fetch from the network.\nA validated import atomically replaces the active country/source/layer snapshot.\nSet DATABASE_URL and a durable ENRICHMENT_DATA_DIR shared with the API. See docs/enrichment-imports.md.\n`,
    );
    return;
  }
  if (command === 'sources') {
    if (rest.length) throw new Error('sources takes no arguments');
    const keys = [
      'osm-geofabrik',
      'geoboundaries-adm1',
      'geoboundaries-adm2',
      'worldpop-r2025a-2026',
      'observed-traffic',
    ];
    process.stdout.write(
      `${JSON.stringify(
        countries.map((country) => ({
          country,
          sources: keys.map((key) => configuredSource(country.code, key)),
        })),
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (command === 'download') {
    const options = flags(rest, ['--country', '--source', '--output']);
    const result = await downloadRegisteredSource(
      need(options, '--country'),
      need(options, '--source'),
      resolve(need(options, '--output')),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'import') {
    const options = flags(rest, ['--input', '--manifest', '--operator']);
    const manifestPath = resolve(need(options, '--manifest'));
    if ((await stat(manifestPath)).size > 2 * 1024 * 1024)
      throw new Error('Manifest exceeds 2 MiB');
    const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    await AppDataSource.initialize();
    try {
      const result = await importDataset(AppDataSource, {
        inputPath: need(options, '--input'),
        manifest,
        operator: need(options, '--operator'),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
      await AppDataSource.destroy();
    }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Enrichment import failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
