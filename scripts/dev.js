// Runs every app's dev server in parallel (`npm run dev -w a -w b` would run
// them one after another, and the first never exits).
import { spawn, spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspaces = ['@nivomi/api', '@nivomi/web'];

// Apps build against the compiled output of shared packages.
const packages = spawnSync(npm, ['run', 'build', '-w', '@nivomi/config'], {
  stdio: 'inherit',
  shell: true,
});
if (packages.status !== 0) {
  process.exit(packages.status ?? 1);
}

const children = workspaces.map((workspace) =>
  spawn(npm, ['run', 'dev', '-w', workspace], { stdio: 'inherit', shell: true }),
);

const stop = () => {
  for (const child of children) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
