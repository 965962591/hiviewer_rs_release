import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { randomUUID } from 'node:crypto';
import { safePath, validateManifest } from './package.mjs';

/** Development simulator, never used as the production permission boundary. */
export async function serveDev(root) {
  const workspace = fileURLToPath(new URL('../../', import.meta.url));
  const manifest = validateManifest(JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')));
  const resources = new Map();
  const handler = async (req, res, next) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/__plugin/resource' && req.method === 'POST') {
        if (resources.size >= 8) throw new Error('Simulator resource limit');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16 * 1024 * 1024) throw new Error('Simulator video limit: 16 MiB'); chunks.push(chunk); }
        const id = randomUUID(); resources.set(id, { bytes: Buffer.concat(chunks), mime: req.headers['content-type'] ?? 'application/octet-stream' }); res.end(id); return;
      }
      if (pathname.startsWith('/__plugin/resource/')) {
        const id = pathname.split('/').pop(); const item = resources.get(id);
        if (req.method === 'DELETE') { resources.delete(id); res.end(); return; }
        if (!item) throw new Error('Resource expired');
        res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', item.mime); res.setHeader('Content-Length', item.bytes.length);
        res.end(req.method === 'HEAD' ? undefined : item.bytes); return;
      }
      if (pathname === '/__plugin') { res.setHeader('Content-Type', 'text/html'); res.end(await fs.readFile(new URL('./dev.html', import.meta.url))); return; }
      if (pathname === '/__plugin/manifest') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(manifest)); return; }
      if (pathname === '/__plugin/source') { res.setHeader('Content-Type', 'text/plain'); res.end(await fs.readFile(path.join(root, 'main.js')).catch(() => Buffer.from(''))); return; }
      if (pathname.startsWith('/__plugin/asset/')) {
        const name = decodeURIComponent(pathname.slice('/__plugin/asset/'.length));
        if (!safePath(name) || !name.startsWith('ui/')) throw new Error('invalid asset');
        const file = await fs.realpath(path.join(root, name));
        if (!file.startsWith(root + path.sep)) throw new Error('unsafe asset');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
        res.end(await fs.readFile(file)); return;
      }
      next();
    } catch (error) { res.statusCode = 400; res.end(String(error)); }
  };
  const server = await createServer({ configFile: false, root: workspace, plugins: [{ name: 'hiviewer-plugin-dev', configureServer(server) { server.middlewares.use(handler); } }], optimizeDeps: { noDiscovery: true, include: [] }, server: { watch: { ignored: ['**/.tmp/**'] }, host: '127.0.0.1', port: 4179, strictPort: true, allowedHosts: ['hiviewer-plugin.localhost'] } });
  try { await server.listen(); } catch (error) { await server.close(); throw error; }
  console.log('Development simulator: http://127.0.0.1:4179/__plugin (mock Host API; native execution is unavailable). Reload after rebuilding.');
  return server;
}
