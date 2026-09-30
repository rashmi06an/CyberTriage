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
    outfile: 'dist-electron/main.cjs',
    // CommonJS: ESM main entries fail to load from inside an asar archive on
    // some Electron builds, causing the packaged app to exit silently. CJS is
    // loaded reliably from asar.
    format: 'cjs',
    // The source uses `import.meta.url` (valid ESM). In a CJS bundle esbuild
    // would otherwise emit `import.meta = {}`, making `import.meta.url`
    // undefined and breaking __dirname. Map it to a real file URL derived from
    // the CJS __filename global instead.
    define: { 'import.meta.url': '__cjsImportMetaUrl' },
    banner: {
      js: "const __cjsImportMetaUrl = require('url').pathToFileURL(__filename).href;",
    },
  }),
  build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
    format: 'cjs',
  }),
]);
