#!/usr/bin/env node
// Explicit vault-to-public export. Never scans a vault or uploads anything.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const value=(flag)=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
const vaultRoot=value('--vault-root'),repoRoot=value('--repo-root');
if(!vaultRoot||!repoRoot){console.error('Usage: node scripts/sync-plugin-docs.mjs --vault-root <vault> --repo-root <DEV> [--write]');process.exit(2);}
const write=args.includes('--write');
const {products}=JSON.parse(readFileSync(join(root,'catalog/plugins.json'),'utf8'));
const digest=s=>createHash('sha256').update(s).digest('hex');
const jobs=[];
for(const p of products)for(const lang of ['ko','en']){
  const master=join(vaultRoot,'70. Outputs/74. Projects/CMDSPACE Plugins',`2026-09-14-${p.slug}-guide.${lang}.md`);
  const text=readFileSync(master,'utf8');
  const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!front)throw new Error(`Missing frontmatter: ${master}`);
  const meta=parse(front[1]);
  for(const key of ['type','aliases','description','author','date created','date modified','tags','model','effort'])if(meta[key]==null)throw new Error(`Missing ${key}: ${master}`);
  const body=text.slice(front[0].length).trim()+'\n';
  const prose=body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g,'');
  if(/omnicontrol:|\/Users\/|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]+|sk-[A-Za-z0-9]{16}/.test(body)||/\[\[|%%|file:\/\//.test(prose))throw new Error(`Non-public content in ${master}; review the master before exporting.`);
  const repoFile=join(repoRoot,p.directory,'docs',lang==='ko'?'guide.ko.md':'guide.md');
  const webFile=join(root,'plugins',p.slug,`guide.${lang}.md`);
  jobs.push({master,body,repoFile,webFile});
}
// Read and validate the whole batch before any writes. Repo copies must already
// be reviewed by their author; web generation never silently changes a README.
for(const j of jobs){
  if(existsSync(j.repoFile)&&readFileSync(j.repoFile,'utf8')!==j.body){
    throw new Error(`Repository manual differs from vault master: ${j.repoFile}. Reconcile intentionally before export.`);
  }
}
for(const j of jobs){
  if(write){
    for(const path of [j.repoFile,j.webFile]){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,j.body);}
  }
  console.log(`${write?'exported':'checked'} ${relative(root,j.webFile)} ${digest(j.body)}`);
}
console.log(`${jobs.length} manual editions ${write?'exported':'validated; pass --write to export'}. No network writes.`);
