import { execFile } from 'node:child_process';
/** Never invoke a shell. Input paths are absolute and executable names are fixed by code. */
export function runTool(
  command: 'gdalinfo' | 'gdal_translate' | 'ogr2ogr',
  args: string[],
  maxBuffer = 8 * 1024 * 1024,
  timeout = 120_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        maxBuffer,
        timeout,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          GDAL_DISABLE_READDIR_ON_OPEN: 'EMPTY_DIR',
          GDAL_CACHEMAX: '64',
          CPL_VSIL_CURL_ALLOWED_EXTENSIONS: '',
          GDAL_PAM_ENABLED: 'NO',
        },
      },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(`${command} failed: ${stderr.slice(0, 1000) || error.message}`));
        else resolve(stdout);
      },
    );
  });
}
