import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const permissions = ['selection.read', 'metadata.read', 'media.read', 'viewer.compare', 'storage', 'notifications', 'native.execute', 'files.export', 'image.decode'];
export const kinds = ['image-analysis', 'image-viewer', 'video-viewer', 'exif-provider', 'details-panel'];
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{0,95}$/.test(value) && !value.includes('..') && !value.endsWith('.');
export const safePath = value => typeof value === 'string' && value.length <= 240 && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f<>"|?*]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const unique = values => new Set(values).size === values.length;
const text = (value, size) => typeof value === 'string' && value.trim().length && Buffer.byteLength(value) <= size && !/[\x00-\x1f]/.test(value);
export function validateManifest(m) {
  assert(m && m.manifestVersion === 1 && m.apiVersion === 1, 'Unsupported manifest/API version');
  const allowed = ['$schema', 'manifestVersion', 'apiVersion', 'id', 'name', 'version', 'description', 'author', 'entry', 'permissions', 'commands', 'configuration', 'backend', 'ui', 'contributions', 'dataVersion', 'localizations', 'imageDecoders'];
  assert(Object.keys(m).every(k => allowed.includes(k)), 'Unknown manifest field');
  assert(validId(m.id) && text(m.name, 120) && text(m.author, 120) && text(m.description, 2000), 'Invalid plugin identity');
  assert(typeof m.version === 'string' && /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(m.version), 'Version must be major.minor.patch');
  assert(m.entry === 'main.js', 'Worker entry must be main.js');
  assert(Array.isArray(m.permissions) && unique(m.permissions) && m.permissions.every(p => permissions.includes(p)), 'Invalid permissions');
  assert(m.dataVersion === undefined || (Number.isInteger(m.dataVersion) && m.dataVersion > 0 && m.dataVersion <= 1000000), 'Invalid dataVersion');
  if (m.ui) assert(safePath(m.ui.entry) && m.ui.entry.startsWith('ui/') && m.ui.entry.endsWith('.html'), 'Invalid UI entry');
  if (m.backend) assert(safePath(m.backend.executable) && m.backend.executable.startsWith('bin/') && ['windows-x86_64', 'windows-aarch64', 'macos-x86_64', 'macos-aarch64', 'linux-x86_64', 'linux-aarch64'].includes(m.backend.target) && ['stdio-jsonl', 'stdio-framed'].includes(m.backend.transport ?? 'stdio-jsonl') && m.permissions.includes('native.execute'), 'Invalid native backend');
  assert(Array.isArray(m.commands) && (m.commands.length > 0 || m.imageDecoders?.length > 0) && m.commands.length <= 32 && unique(m.commands.map(c => c.id)), 'Invalid commands');
  for (const c of m.commands) {
    assert(validId(c.id) && text(c.title, 120) && ['worker', 'view', 'sidecar'].includes(c.handler ?? 'worker'), 'Invalid command');
    assert(!c.contexts || (c.contexts.length <= 1 && c.contexts.every(v => v === 'selection')), 'Invalid contexts');
    assert(c.handler !== 'view' || m.ui, 'View entry missing');
    assert(c.handler !== 'sidecar' || (m.backend && c.method), 'Backend declaration missing');
    if (c.method) assert(/^[a-zA-Z0-9/_.-]{1,128}$/.test(c.method) && !/^(host|plugin)\//.test(c.method), 'Reserved or invalid method');
  }
  const contributions = m.contributions ?? [];
  assert(contributions.length <= 64 && unique(contributions.map(c => c.id)), 'Invalid contributions');
  for (const c of contributions) {
    assert(validId(c.id) && kinds.includes(c.kind) && text(c.title, 120) && m.commands.some(cmd => cmd.id === c.command), 'Invalid contribution');
    assert(Object.keys(c).every(k => ['id', 'kind', 'title', 'command', 'mediaTypes'].includes(k)), 'Unknown contribution field');
    if (c.mediaTypes !== undefined) assert(c.kind === 'details-panel' && Array.isArray(c.mediaTypes) && c.mediaTypes.length > 0 && c.mediaTypes.length <= 2 && unique(c.mediaTypes) && c.mediaTypes.every(t => ['image', 'video'].includes(t)), 'Invalid details mediaTypes');
  }
  const decoders = m.imageDecoders ?? [];
  assert(Array.isArray(decoders) && decoders.length <= 16 && unique(decoders.map(d => d.id)), 'Invalid image decoders');
  if (decoders.length) assert(m.backend?.transport === 'stdio-framed' && m.permissions.includes('image.decode'), 'Image decoders require framed sidecar and image.decode');
  const extensions = decoders.flatMap(d => d.extensions);
  assert(unique(extensions), 'Duplicate decoder extension');
  for (const d of decoders) {
    assert(Object.keys(d).every(k => ['id', 'extensions', 'probe', 'decode'].includes(k)), 'Unknown decoder field');
    assert(validId(d.id) && Array.isArray(d.extensions) && d.extensions.length > 0 && d.extensions.length <= 32 && d.extensions.every(e => /^[a-z0-9]{1,16}$/.test(e)), 'Invalid decoder extension');
    assert(d.probe !== d.decode && [d.probe, d.decode].every(m => typeof m === 'string' && /^[A-Za-z0-9/_.-]{1,128}$/.test(m) && !/^(host|plugin)\//.test(m)), 'Invalid decoder method');
  }
  const settings = m.configuration ?? [];
  assert(settings.length <= 32 && unique(settings.map(s => s.key)), 'Invalid configuration');
  for (const s of settings) assert(validId(s.key) && text(s.title, 120) && ['string', 'number', 'boolean'].includes(s.type) && typeof s.default === s.type && (s.type !== 'string' || Buffer.byteLength(s.default) <= 4096), 'Invalid setting');
  return m;
}
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export async function collect(root) {
  root = path.resolve(root);
  assert(!(await fs.lstat(root)).isSymbolicLink(), 'Package root cannot be a link');
  root = await fs.realpath(root);
  const manifest = validateManifest(JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')));
  const files = new Map(); let total = 0; const seen = new Set();
  async function add(relative, depth = 0) {
    assert(safePath(relative) && depth <= 16, `Unsafe path: ${relative}`);
    const target = path.join(root, relative); const stat = await fs.lstat(target);
    assert(!stat.isSymbolicLink() && (await fs.realpath(target)).startsWith(root + path.sep), `Link or unsafe entry: ${relative}`);
    if (stat.isDirectory()) { for (const name of (await fs.readdir(target)).sort()) await add(`${relative}/${name}`, depth + 1); return; }
    assert(stat.isFile() && stat.size <= 128 * 1024 * 1024, `Invalid file: ${relative}`);
    assert(!seen.has(relative.toLowerCase()) && files.size < 2048 && total + stat.size <= 256 * 1024 * 1024, 'Package size or path conflict');
    const bytes = await fs.readFile(target); total += bytes.length; seen.add(relative.toLowerCase()); files.set(relative, bytes);
  }
  await add('manifest.json');
  for (const entry of ['main.js', 'ui', 'bin']) { if (await fs.stat(path.join(root, entry)).catch(() => null)) await add(entry); }
  if (manifest.commands.some(c => (c.handler ?? 'worker') === 'worker')) assert(files.has('main.js') && files.get('main.js').length <= 2 * 1024 * 1024, 'Missing or oversized main.js; run build first');
  if (manifest.ui) assert(files.has(manifest.ui.entry), 'Missing UI file');
  if (manifest.backend) assert(files.has(manifest.backend.executable), 'Missing sidecar binary; compile it first');
  assert(files.get('manifest.json').length <= 64 * 1024, 'Manifest too large');
  return { manifest, files: new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Deterministic ZIP32 (stored entries). No shell, symlinks, or external archiver. */
export function zip(files) {
  const parts = []; const directory = []; let offset = 0;
  for (const [name, bytes] of files) {
    const filename = Buffer.from(name); const crc = crc32(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, filename, bytes); directory.push(central, filename); offset += local.length + filename.length + bytes.length;
    assert(offset <= 128 * 1024 * 1024, 'ZIP exceeds 128 MiB');
  }
  const central = Buffer.concat(directory); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}
