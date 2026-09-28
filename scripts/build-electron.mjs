import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  external: ['electron'],
  logLevel: 'info',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.mjs',
    format: 'esm',
  }),
  build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
    format: 'cjs',
  }),
]);
