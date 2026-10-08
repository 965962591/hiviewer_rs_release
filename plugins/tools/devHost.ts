import { createPluginSandbox } from '../../src/hiviewer/plugins/sandbox';
import { pluginViewDocument } from '../../src/hiviewer/plugins/viewDocument';

const manifest = await fetch('/__plugin/manifest').then(r => r.json());
const commands = document.querySelector<HTMLSelectElement>('#command')!;
const output = document.querySelector<HTMLElement>('#output')!;
const container = document.querySelector<HTMLElement>('#view')!;
for (const command of manifest.commands) commands.add(new Option(command.title, command.id));
const storage = new Map<string, unknown>(); const resources = new Map<string, Blob>(); const urls = new Set<string>();
const streams = new Set<string>();
let dispose: (() => void) | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
const stop = () => { dispose?.(); dispose = undefined; clearTimeout(timer); resources.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); for (const id of streams) void fetch(`/__plugin/resource/${id}`, { method: 'DELETE' }); streams.clear(); container.replaceChildren(); };
document.querySelector('#stop')!.addEventListener('click', stop);
async function start() {
  stop(); output.textContent = '';
  const selected = [...document.querySelector<HTMLInputElement>('#files')!.files!];
  const files = selected.map((f, index) => ({ path: `/selection/${index}/${f.name}`, filename: f.name, sizeBytes: f.size, width: null, height: null }));
  const getFile = (path: string) => { const index = files.findIndex(f => f.path === path); if (index < 0) throw new Error('plugins/path-not-selected'); return selected[index]; };
  const requirePermission = (permission: string) => { if (!manifest.permissions.includes(permission)) throw new Error('plugins/permission-denied'); };
  const dispatch = async (method: string, params: Record<string, any>) => {
    if (method === 'selection.read') { requirePermission('selection.read'); return files; }
    if (method === 'metadata.read') { requirePermission('metadata.read'); getFile(params.path); return { Simulator: 'Real EXIF is available in Hiviewer' }; }
    if (method === 'media.preview' || method === 'media.video') {
      requirePermission('media.read'); const file = getFile(params.path); const resourceId = crypto.randomUUID();
      let blob: Blob = file; let size = {};
      if (method === 'media.preview') {
        const bitmap = await createImageBitmap(file); const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        size = { width: canvas.width, height: canvas.height, sourceWidth: bitmap.width, sourceHeight: bitmap.height }; bitmap.close(); blob = await canvas.convertToBlob({ type: 'image/png' });
      }
      let url;
      if (method === 'media.video') { const response = await fetch('/__plugin/resource', { method: 'POST', body: file, headers: { 'Content-Type': file.type } }); if (!response.ok) throw new Error(await response.text()); const id = await response.text(); streams.add(id); url = `http://hiviewer-plugin.localhost:4179/__plugin/resource/${id}`; }
      else { url = URL.createObjectURL(blob); urls.add(url); }
      resources.set(resourceId, blob);
      return { resourceId, url, ...size, mime: blob.type, mediaVersion: 1, colorSpace: 'srgb', orientation: 1, timeBase: 'seconds' };
    }
    if (method === 'media.readBytes') { requirePermission('media.read'); const resource = resources.get(params.key); if (!resource) throw new Error('plugins/resource-expired'); return resource.arrayBuffer(); }
    if (method === 'media.release') { requirePermission('media.read'); resources.delete(params.resourceId); return null; }
    if (method.startsWith('storage.')) { requirePermission('storage'); if (method === 'storage.set') storage.set(params.key, params.value); if (method === 'storage.remove') storage.delete(params.key); return storage.get(params.key) ?? null; }
    if (method === 'exports.save') { requirePermission('files.export'); const url = URL.createObjectURL(new Blob([params.bytes])); urls.add(url); const a = document.createElement('a'); a.href = url; a.download = params.name; a.click(); return params.name; }
    if (method === 'notifications.show') { requirePermission('notifications'); output.textContent = params.message; return null; }
    if (method === 'viewer.compare') { requirePermission('viewer.compare'); for (const path of params.paths) getFile(path); output.textContent = JSON.stringify(params.paths); return null; }
    throw new Error(`Simulator does not provide ${method}; use Hiviewer`);
  };
  const channel = new MessageChannel();
  channel.port1.onmessage = async ({ data }) => {
    if (data.type !== 'request') { output.textContent = JSON.stringify(data, null, 2); if (data.type === 'result' || data.type === 'error') stop(); return; }
    try { const value = await dispatch(data.method, data.params); channel.port1.postMessage({ id: data.id, value }, value instanceof ArrayBuffer ? [value] : []); }
    catch (error) { channel.port1.postMessage({ id: data.id, error: String(error) }); }
  };
  const command = manifest.commands.find((c: any) => c.id === commands.value);
  if (command.handler === 'view') {
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.style.cssText = 'width:100%;height:100%;border:0';
    frame.srcdoc = pluginViewDocument(await fetch(`/__plugin/asset/${manifest.ui.entry}`).then(r => r.text()), 'http://hiviewer-plugin.localhost:4179/__plugin/asset/');
    frame.onload = () => frame.contentWindow!.postMessage({ type: 'hiviewer-init', environment: { locale: 'en-US', configuration: {}, theme: { '--hiviewer-background': 'Canvas', '--hiviewer-text': 'CanvasText', '--hiviewer-accent': 'LinkText', '--hiviewer-border': 'GrayText', '--hiviewer-font': 'sans-serif' } } }, '*', [channel.port2]);
    container.append(frame); dispose = () => { channel.port1.close(); frame.remove(); };
  } else {
    const sandbox = await createPluginSandbox(); dispose = () => { channel.port1.close(); sandbox.dispose(); };
    sandbox.port.onmessage = ({ data }) => { output.textContent = JSON.stringify(data); stop(); };
    sandbox.port.postMessage({ source: await fetch('/__plugin/source').then(r => r.text()), command: command.id, configuration: {}, locale: 'en-US' }, [channel.port2]);
    timer = setTimeout(() => { output.textContent = 'Task timeout'; stop(); }, 60000);
  }
}
document.querySelector('#run')!.addEventListener('click', () => { void start().catch(error => { output.textContent = String(error); stop(); }); });
