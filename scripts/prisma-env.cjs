/**
 * Load monorepo root .env files then run Prisma CLI from apps/api.
 * Usage: node scripts/prisma-env.cjs migrate deploy
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'apps', 'api');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Match Nest ConfigModule precedence: later files override earlier ones.
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(apiDir, '.env'));
loadEnvFile(path.join(apiDir, '.env.local'));

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/prisma-env.cjs <prisma-command> [args...]');
  process.exit(1);
}

const prismaBin = path.join(
  apiDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

const result = spawnSync(prismaBin, args, {
  cwd: apiDir,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);