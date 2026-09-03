import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const repo=new URL('../../',import.meta.url);const read=path=>readFile(new URL(path,repo),'utf8');
test('package defines isolated AuditOS test and build scripts',async()=>{const pkg=JSON.parse(await read('package.json'));assert.match(pkg.scripts.test,/auditos\/tests/);assert.match(pkg.scripts.verify,/node --check auditos\/app\.js/);assert.match(pkg.scripts.build,/auditos\/build\.mjs/);});
test('vercel config deploys only the static AuditOS output',async()=>{const config=JSON.parse(await read('vercel.json'));assert.equal(config.outputDirectory,'.vercel-static');assert.match(config.buildCommand,/auditos\/build\.mjs/);});
test('build script copies focused app and not test fixtures',async()=>{const script=await read('auditos/build.mjs');assert.match(script,/\.vercel-static/);assert.match(script,/core/);assert.match(script,/browser/);assert.doesNotMatch(script,/tests.*cp|cp.*tests/);});
