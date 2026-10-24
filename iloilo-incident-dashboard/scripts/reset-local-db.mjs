import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (!stdin.isTTY) { console.error('Reset requires an interactive terminal and explicit confirmation.'); process.exit(1); }
const prompt = createInterface({ input: stdin, output: stdout });
const answer = await prompt.question('Stop the local Worker first. This deletes ALL normal local incidents/history and restores reference data. Type RESET LOCAL D1 to continue: ');
prompt.close();
if (answer !== 'RESET LOCAL D1') { console.log('Cancelled; nothing changed.'); process.exit(0); }
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
for (const args of [
  ['d1', 'execute', 'DB', '--local', '--file', 'scripts/reset-local-db.sql'],
  ['d1', 'migrations', 'apply', 'DB', '--local'],
]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
console.log('Local D1 reset. No remote resources or spatial source files were touched.');
