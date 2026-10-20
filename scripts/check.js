import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(`${dir}/${entry.name}`) : `${dir}/${entry.name}`,
      ),
    )
  ).flat();
}
let count = 0;
for (const dir of ['server', 'frontend/js', 'scripts', 'tests'])
  for (const file of await files(dir))
    if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(1);
      count++;
    }
console.log(`Syntax checked ${count} JavaScript modules.`);
