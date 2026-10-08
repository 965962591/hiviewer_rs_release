import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const run = (program, args) => { const result = spawnSync(program, args, { stdio: 'inherit', windowsHide: true }); if (result.status !== 0) throw new Error(result.error?.message ?? `${program} failed`); };
for (const name of ['image-analysis', 'exif-provider']) run(process.execPath, ['plugins/tools/cli.mjs', 'build', `plugins/examples/${name}`]);
run(process.platform === 'win32' ? 'cargo.exe' : 'cargo', ['build', '--manifest-path', 'plugins/examples/rust-analysis/Cargo.toml']);
run(process.platform === 'win32' ? 'cargo.exe' : 'cargo', ['build', '--manifest-path', 'plugins/examples/psd-decoder/Cargo.toml']);
run(process.platform === 'win32' ? 'cargo.exe' : 'cargo', ['build', '--manifest-path', 'plugins/tests/sidecar-fixture/Cargo.toml']);
for (const [name, binary] of [['rust-analysis', 'hiviewer-example-sidecar'], ['psd-decoder', 'hiviewer-psd-decoder']]) {
const executable = `${binary}${process.platform === 'win32' ? '.exe' : ''}`;
const root = `plugins/examples/${name}`;
await fs.mkdir(`${root}/bin`, { recursive: true });
await fs.copyFile(`${root}/target/debug/${executable}`, `${root}/bin/${executable}`);
const manifest = JSON.parse(await fs.readFile(`${root}/manifest.json`, 'utf8'));
manifest.backend.executable = `bin/${executable}`;
manifest.backend.target = `${{ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]}-${{ x64: 'x86_64', arm64: 'aarch64' }[process.arch]}`;
await fs.writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}
for (const name of ['image-analysis', 'image-viewer', 'video-viewer', 'exif-provider', 'details-panel', 'rust-analysis', 'psd-decoder']) run(process.execPath, ['plugins/tools/cli.mjs', 'check', `plugins/examples/${name}`]);
