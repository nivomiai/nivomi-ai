// Development runner: compile once, then keep `tsc --watch` and
// `node --watch` running side by side. Plain tsc (not a bundler) is used
// because NestJS dependency injection needs emitted decorator metadata.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const project = ['-p', 'tsconfig.build.json'];

const initial = spawnSync(process.execPath, [tsc, ...project], { stdio: 'inherit' });
if (initial.status !== 0) {
  process.exit(initial.status ?? 1);
}

const children = [
  spawn(process.execPath, [tsc, ...project, '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', 'dist/main.js'], { stdio: 'inherit' }),
];

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
