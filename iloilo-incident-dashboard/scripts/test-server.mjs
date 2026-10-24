// Isolated Wrangler database: never write automated incidents to normal .wrangler/state.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

mkdirSync('.wrangler', { recursive: true });
const persistence = mkdtempSync(resolve('.wrangler/mvp-test-'));
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const migration = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persistence], { stdio: 'inherit' });
if (migration.status !== 0) process.exit(1);
const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8790', '--persist-to', persistence, '--var', 'APP_ENV:development', '--var', 'ENABLE_DEV_REVIEW:true'], { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
