/**
 * Static-export build (GitHub Pages / `npm run export`).
 *
 * The WhatsApp webhook (src/app/api/) is a server route — Next refuses to
 * include a request-dependent Route Handler in `output: 'export'`, and a
 * static host couldn't run it anyway. There is no config switch to exclude
 * a single route from export, so this wrapper leans on the app router's
 * private-folder convention instead: folders starting with "_" never become
 * routes. The api folder is renamed aside for the duration of the build and
 * always restored, even when the build fails.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'src', 'app', 'api');
const hiddenDir = join(root, 'src', 'app', '_api-server-only');

const hasApi = existsSync(apiDir);
if (hasApi) renameSync(apiDir, hiddenDir);

let status = 1;
try {
  const result = spawnSync('npx', ['next', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, EXPORT: '1' },
  });
  status = result.status ?? 1;
} finally {
  if (hasApi) renameSync(hiddenDir, apiDir);
}

process.exit(status);
