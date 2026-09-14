#!/usr/bin/env node
// Produce an explicit public-only upload tree. No network, login or deployment.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const idx=process.argv.indexOf('--out');
if(idx<0||!process.argv[idx+1])throw new Error('Specify a NEW output directory: node scripts/stage-public.mjs --out <path>');
const OUT=resolve(process.argv[idx+1]);
if(OUT===ROOT||OUT.startsWith(ROOT+'/plugins')||existsSync(OUT))throw new Error('Output must be a new, separate directory; existing trees are never overwritten.');
const files=[];
function walk(dir){for(const e of readdirSync(join(ROOT,dir),{withFileTypes:true})){const name=join(dir,e.name);if(e.isSymbolicLink())throw new Error(`Symlink not allowed: ${name}`);if(e.isDirectory())walk(name);else files.push(name);}}
files.push('index.html','vercel.json');
walk('plugins');walk('assets/logos');
files.push('assets/og/og-apps.png');
const appData=JSON.parse(readFileSync(join(ROOT,'data/apps.json'),'utf8'));
const hidden=[];
for(const a of [...appData.apps,...(appData.longtail||[])]){
  if(a.is_private&&a.repo_url){hidden.push(a.name);a.repo_url='';a.download_url='';}
  // Build provenance about local repositories does not belong in a public catalog.
  delete a.dirty;delete a.is_private;
}
for(const name of files){
  if(!/\.(html|js|css|md|json)$/.test(name))continue;
  const text=readFileSync(join(ROOT,name),'utf8');
  if(/omnicontrol:|\/Users\/|ghp_[A-Za-z0-9]+|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(text))throw new Error(`Review non-public content in ${name}`);
}
// All validation happens before copying; only allowlisted files are uploaded later.
mkdirSync(OUT,{recursive:true});
for(const name of files){const dest=join(OUT,name);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(ROOT,name),dest);}
mkdirSync(join(OUT,'data'),{recursive:true});
writeFileSync(join(OUT,'data/apps.json'),JSON.stringify(appData,null,2)+'\n');
// A ready-to-upload stage has no npm sources; remove source-build settings.
const config=JSON.parse(readFileSync(join(ROOT,'vercel.json'),'utf8'));
delete config.buildCommand;delete config.outputDirectory;
writeFileSync(join(OUT,'vercel.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({output:OUT,files:files.length+1,removedPrivateRepoLinks:hidden,excluded:['candidate reports','local catalog source','scanners','private notes','node_modules','.git','.vercel'],deployment:'NOT performed'},null,2));
