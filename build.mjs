// Bundles the TypeScript source into dist/, the folder Chrome loads.
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/inject.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  outfile: 'dist/inject.js',
  legalComments: 'none',
});
await copyFile('src/manifest.json', 'dist/manifest.json');
console.log('Built dist/');
