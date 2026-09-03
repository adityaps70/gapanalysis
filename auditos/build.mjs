import { rm, mkdir, cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'.vercel-static');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const entry of ['index.html','styles.css','app.js','core','browser']){
  await cp(resolve(root,'auditos',entry),resolve(out,entry),{recursive:true});
}
console.log(`AuditOS static build ready: ${out}`);
