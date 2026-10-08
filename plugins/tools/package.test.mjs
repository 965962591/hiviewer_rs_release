import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { safePath, validateManifest, collect, zip } from './package.mjs';
test('details template packs and validates media filters and command references', async () => {
  const { manifest, files } = await collect('plugins/examples/details-panel');
  assert.ok(files.has('ui/view.js'));
  assert.ok(zip(files).length > 0);
  const c = manifest.contributions[0];
  const check = contribution => validateManifest({ ...manifest, contributions: [contribution] });
  const { mediaTypes, ...withoutFilter } = c;
  assert.doesNotThrow(() => check(withoutFilter));
  assert.doesNotThrow(() => check({ ...c, mediaTypes: ['image'] }));
  for (const mediaTypes of [[], ['image', 'image'], ['audio'], 'image', null]) assert.throws(() => check({ ...c, mediaTypes }));
  assert.throws(() => check({ ...c, kind: 'exif-provider' }));
  assert.throws(() => check({ ...c, command: 'missing' }));
  assert.throws(() => check({ ...c, autoRun: true }));
});
test('package paths reject Windows aliases and traversal', () => {
  for (const path of ['../x', '/tmp/x', 'C:/x', 'ui/a\\b', 'ui/con.txt', 'ui/a. ', 'ui/a:stream', 'ui//x']) assert.equal(safePath(path), false, path);
  assert.equal(safePath('ui/assets/index.js'), true);
});
test('automatic decoder declarations require native permission and bounded extensions', async () => {
  const m = JSON.parse(await fs.readFile('plugins/examples/psd-decoder/manifest.json', 'utf8'));
  assert.equal(validateManifest(m), m);
  assert.throws(() => validateManifest({ ...m, permissions: ['native.execute'] }));
  assert.throws(() => validateManifest({ ...m, backend: { ...m.backend, transport: 'stdio-jsonl' } }));
  for (const extension of ['.psd', '../psd', '*', 'PSD', 'a'.repeat(17)])
    assert.throws(() => validateManifest({ ...m, imageDecoders: [{ ...m.imageDecoders[0], extensions: [extension] }] }));
  assert.throws(() => validateManifest({ ...m, imageDecoders: [{ ...m.imageDecoders[0], decode: 'host/read' }] }));
  assert.throws(() => validateManifest({ ...m, imageDecoders: [] }));
  assert.throws(() => validateManifest({ ...m, imageDecoders: [m.imageDecoders[0], { ...m.imageDecoders[0], id: 'duplicate' }] }));
});
test('real example can be packed and versions fail closed', async () => {
  const { manifest, files } = await collect('plugins/examples/video-viewer');
  assert.throws(() => validateManifest({ ...manifest, apiVersion: 2 }));
  assert.throws(() => validateManifest({ ...manifest, permissions: ['shell'] }));
  assert.throws(() => validateManifest({ ...manifest, commands: [{ id: 'run', title: 'x', handler: 'sidecar', method: 'host/read' }] }));
  const bytes = zip(files); assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.deepEqual(bytes, zip(files));
});
