import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Usage: node check-fixtures.mjs <psd-0.3.5/tests/fixtures>');
const root=path.resolve(process.argv[2]);
const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.json',import.meta.url),'utf8'));
const executable=fileURLToPath(new URL('./'+manifest.backend.executable,import.meta.url));
const files=fs.readdirSync(root).filter(f=>f.endsWith('.psd'));
const message=(id,method,params)=>{const json=Buffer.from(JSON.stringify({jsonrpc:'2.0',id,method,params}));const head=Buffer.alloc(5);head.writeUInt32LE(json.length+1);return Buffer.concat([head,json]);};
const requests=[message(1,'plugin/initialize',{plugin:{id:manifest.id,version:manifest.version}})];
files.forEach((file,index)=>requests.push(message(index+2,'psd/decode',{path:path.join(root,file),maxEdge:null,maxPixels:33554432,configuration:{}})));
const run=spawnSync(executable,[],{input:Buffer.concat(requests),timeout:30000,maxBuffer:16*1024*1024,windowsHide:true});
assert.equal(run.status,0,run.stderr.toString());
let position=0, binary, passed=0, rejected=0;
while(position<run.stdout.length){
 const length=run.stdout.readUInt32LE(position), kind=run.stdout[position+4];
 const payload=run.stdout.subarray(position+5,position+4+length);position+=4+length;
 if(kind===1){binary=payload.subarray(2+payload.readUInt16LE());continue;}
 const response=JSON.parse(payload); if(response.id===1)continue;
 const filename=files[response.id-2], source=fs.readFileSync(path.join(root,filename));
 if(response.error){const unsupported=source.readUInt16BE(22)!==8 || source.readUInt16BE(24)!==3 || source.readUInt16BE(12)<3;assert(unsupported,filename+': '+response.error.message);rejected++;continue;}
 const result=response.result;
 assert.equal(result.width,source.readUInt32BE(18));assert.equal(result.height,source.readUInt32BE(14));
 assert.equal(binary.readUInt32BE(16),result.width);assert.equal(binary.readUInt32BE(20),result.height);
 if(filename==='green-1x1.psd'){
   const data=[];for(let p=8;p<binary.length;){const n=binary.readUInt32BE(p);if(binary.toString('ascii',p+4,p+8)==='IDAT')data.push(binary.subarray(p+8,p+8+n));p+=12+n;}
   const raw=inflateSync(Buffer.concat(data));assert.deepEqual([...raw.subarray(1)],[0,255,0,255]);
 }
 passed++;binary=undefined;
}
console.log({externalFixtures:files.length,decoded:passed,explicitlyUnsupported:rejected,greenPixel:'0,255,0,255'});
