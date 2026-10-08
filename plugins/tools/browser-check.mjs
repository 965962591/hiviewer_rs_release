import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const port = 9337;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'hiviewer-plugin-browser-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'http://127.0.0.1:4179/__plugin'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
edge.stderr.on('data', chunk => console.log(String(chunk).slice(0,2000)));
let socket;
try {
  let pages;
  for (let i = 0; i < 60; i++) { try { pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); if (pages.some(p => p.type === 'page')) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  let serial = 0; const pending = new Map();
  socket.onclose = event => { console.log('CDP closed',event.code,event.reason); for(const {reject} of pending.values()) reject(new Error('CDP closed')); };
  socket.onmessage = ({ data }) => { const response = JSON.parse(data); if (response.method === 'Log.entryAdded' || response.method === 'Runtime.exceptionThrown') console.log(JSON.stringify(response).slice(0,3000)); if (pending.has(response.id)) { const { resolve, reject } = pending.get(response.id); pending.delete(response.id); response.error ? reject(response.error) : resolve(response.result); } };
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
  const evaluate = async expression => { const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await rpc('Runtime.enable'); await rpc('Log.enable'); await rpc('Browser.setDownloadBehavior', { behavior: 'deny' });
  await new Promise(r => setTimeout(r, 1500));
  console.log('page', await evaluate('document.title'));
  await evaluate(`(async () => { const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#808080'; ctx.fillRect(0,0,16,16); let blob = await new Promise(r => canvas.toBlob(r)); if (${process.argv[3] === 'video'}) { const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream,{mimeType:'video/webm'}); const chunks=[]; recorder.ondataavailable=e=>chunks.push(e.data); const done=new Promise(r=>recorder.onstop=r); recorder.start(); for(let i=0;i<5;i++){ctx.fillStyle=i%2?'red':'blue';ctx.fillRect(0,0,16,16);await new Promise(r=>setTimeout(r,100));}recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());blob=new Blob(chunks,{type:'video/webm'}); } const transfer = new DataTransfer(); transfer.items.add(new File([blob], ${process.argv[3] === 'video' ? "'fixture.webm'" : "'fixture.png'"}, {type:blob.type})); document.querySelector('#files').files = transfer.files; document.querySelector('#run').click(); })()`);
  if (process.argv[2] === 'view') {
    await new Promise(r => setTimeout(r, 1800));
    await rpc('Page.enable');
    console.log('view host',await evaluate("JSON.stringify({output:document.querySelector('#output').textContent,frames:document.querySelectorAll('iframe').length})"));
    const targets = await rpc('Target.getTargets');
    const {sessionId} = await rpc('Target.attachToTarget', {targetId:targets.targetInfos.find(t=>t.type==='iframe').targetId,flatten:true});
    const result = await rpc('Runtime.evaluate', { expression: `JSON.stringify({status:document.querySelector('#status')?.textContent,width:document.querySelector('canvas')?.width,saveDisabled:document.querySelector('#save')?.disabled, video:!!document.querySelector('video'),sdk:window.hiviewer?.version,parentBlocked:(()=>{try{parent.document;return false}catch{return true}})()})`, returnByValue:true },sessionId);
    console.log('view',result.result.value);
    if (process.argv[3] === 'video') { const played = await rpc('Runtime.evaluate', { expression:`(async()=>{const video=document.querySelector('video');video.muted=true;await video.play();await new Promise(r=>setTimeout(r,250));video.pause();return {width:video.videoWidth,time:video.currentTime,duration:video.duration};})()`, awaitPromise:true,returnByValue:true },sessionId); console.log('playback',played.result?.value); if (!(played.result?.value?.time > 0)) throw new Error('Video did not play'); }
    if (!result.result.value.includes('"saveDisabled":false') && !result.result.value.includes('"video":true')) throw new Error('View failed');
    await evaluate("document.querySelector('#stop').click()");
    console.log('remaining frames',await evaluate('document.querySelectorAll("iframe").length'));
  } else {
  let result;
  for(let i=0;i<50;i++){ result = await evaluate("document.querySelector('#output').textContent"); if (result.includes('result') || result.includes('error')) break; await new Promise(r=>setTimeout(r,200)); }
  console.log('result', result);
  if(!result.includes('"type": "result"')) throw new Error('Example did not complete');
  // Probe the actual production Worker bootstrap for boundary access.
  const isolation = await evaluate(`(async () => { const {createPluginSandbox} = await import('/src/hiviewer/plugins/sandbox.ts'); const sandbox = await createPluginSandbox(); const channel = new MessageChannel(); try { return await new Promise(resolve => { channel.port1.onmessage = e => resolve(e.data); sandbox.port.postMessage({source:'export default {commands:{run:async()=>{let blocked=false;try{await fetch("http://127.0.0.1:4179/__plugin/manifest")}catch{blocked=true}return {title:JSON.stringify({document:typeof document,tauri:typeof globalThis.__TAURI_INTERNALS__,networkBlocked:blocked})}}}}',command:'run',locale:'en-US',configuration:{}},[channel.port2]); }); } finally { channel.port1.close(); sandbox.dispose(); } })()`);
  console.log('isolation', isolation); if(!isolation.value?.title.includes('"networkBlocked":true')) throw new Error('Network was not isolated');
  for (const example of ['exif-provider']) {
    const result = await evaluate(`(async () => { const {createPluginSandbox} = await import('/src/hiviewer/plugins/sandbox.ts'); const source = await fetch('/plugins/examples/${example}/main.js').then(r=>r.text()); const sandbox = await createPluginSandbox(); const channel = new MessageChannel(); try { return await new Promise(resolve => { channel.port1.onmessage = ({data}) => { if(data.type !== 'request') { if(data.type==='result'||data.type==='error') resolve(data); return; } let value=null; if(data.method==='selection.read') value=[{path:'/fixture.png',filename:'fixture.png',sizeBytes:64,width:4,height:4}]; else if(data.method==='metadata.read') value={Make:'Fixture',Model:'Test'}; else if(data.method==='exports.save') value='report.json'; channel.port1.postMessage({id:data.id,value}); }; sandbox.port.postMessage({source,command:'run',locale:'en-US',configuration:{}},[channel.port2]); }); } finally { channel.port1.close(); sandbox.dispose(); } })()`);
    console.log(example, result); if(result.type !== 'result') throw new Error(`${example} failed`);
  }
  const cancelled = await evaluate(`(async () => { const {createPluginSandbox} = await import('/src/hiviewer/plugins/sandbox.ts'); const sandbox = await createPluginSandbox(); const channel = new MessageChannel(); sandbox.port.postMessage({source:'export default {commands:{run(){while(true){}}}}',command:'run',locale:'en-US',configuration:{}},[channel.port2]); await new Promise(r=>setTimeout(r,100));sandbox.dispose();channel.port1.close();return document.querySelectorAll('iframe').length;})()`);
  console.log('frames after infinite-loop termination',cancelled); if(cancelled !== 0) throw new Error('Sandbox was not disposed');
  }
} finally { socket?.close(); edge.kill(); }
