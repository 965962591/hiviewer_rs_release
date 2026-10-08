#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, digest, zip } from './package.mjs';

const [command, input, output, ...args] = process.argv.slice(2);
async function build(root) {
  const entry = path.join(root, 'main.ts');
  if (!(await fs.stat(entry).catch(() => null))) return;
  const { build } = await import('vite');
  await build({ configFile: false, root, build: { emptyOutDir: true, outDir: path.join(root, '.hiviewer-build'), minify: false, lib: { entry, formats: ['es'], fileName: () => 'main.js' } } });
  await fs.copyFile(path.join(root, '.hiviewer-build/main.js'), path.join(root, 'main.js'));
}
async function main() {
  if (command === 'create') {
    if (!input) throw new Error('create requires an output directory');
    const template = output ?? 'image-analysis';
    if (!['image-analysis', 'image-viewer', 'video-viewer', 'exif-provider', 'details-panel', 'rust-analysis', 'psd-decoder'].includes(template)) throw new Error('Unknown template');
    if (await fs.stat(input).catch(() => null)) throw new Error('Output directory already exists');
    const source = fileURLToPath(new URL(`../examples/${template}/`, import.meta.url));
    await fs.cp(source, input, { recursive: true, filter: value => !/(?:^|[\\/])(target|bin)(?:[\\/]|$)/.test(value) });
    if (template === 'rust-analysis' || template === 'psd-decoder') {
      await fs.cp(fileURLToPath(new URL('../sdk/rust/', import.meta.url)), path.join(input, 'sdk'), { recursive: true, filter: value => !/(?:^|[\\/])target(?:[\\/]|$)/.test(value) });
      const cargo = path.join(input, 'Cargo.toml'); await fs.writeFile(cargo, (await fs.readFile(cargo, 'utf8')).replace('../../sdk/rust', 'sdk'));
    } else if (await fs.stat(path.join(input, 'main.ts')).catch(() => null)) {
      await fs.cp(fileURLToPath(new URL('../sdk/typescript/', import.meta.url)), path.join(input, 'sdk'), { recursive: true });
      const main = path.join(input, 'main.ts'); await fs.writeFile(main, (await fs.readFile(main, 'utf8')).replace('../../sdk/typescript/index', './sdk/index'));
    }
    console.log(`Created ${input}. Edit manifest.json and source. Use build/check/pack to prepare the plugin.`); return;
  }
  if (!input) throw new Error('Usage: npm run plugin -- create|build|check|dev|pack <path> [output/options]');
  const root = path.resolve(input);
  if (command === 'build' || command === 'dev') {
    await build(root);
    if (command === 'dev') {
      const { serveDev } = await import('./dev.mjs'); await serveDev(root);
    }
    return;
  }
  const { manifest, files } = await collect(root);
  if (command === 'check') { console.log(`OK ${manifest.id}@${manifest.version}: ${files.size} files`); return; }
  if (command !== 'pack' || !output || output.startsWith('--') || args.length) throw new Error('pack <directory> <output.hvp>');
  const checksums = Buffer.from(JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, digest(bytes)]))));
  files.set('checksums.json', checksums);
  const packed = zip(files);
  await fs.writeFile(output, packed, { flag: 'wx' });
  console.log(`${output}: ${packed.length} bytes, SHA-256 ${digest(packed)}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
