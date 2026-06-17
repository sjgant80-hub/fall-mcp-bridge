#!/usr/bin/env node
// Smoke test for fall-mcp-bridge · runs CLI modes + stdio handshake
// Usage: node test.mjs

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

console.log('═══ fall-mcp-bridge smoke test ═══\n');

function run(args, timeout=8000) {
  return new Promise((res, rej) => {
    const p = spawn('node', ['server.mjs', ...args]);
    let out='', err='';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    const t = setTimeout(timeout).then(() => p.kill());
    p.on('close', code => res({ code, out, err }));
    p.on('error', rej);
  });
}

const v = await run(['--version']);
console.log('1. --version:', v.out.trim() ? '✓' : '✗');
const p = await run(['--probe']);
const probeOk = p.out.includes('"ollama"') && p.out.includes('"femto"');
console.log('2. --probe:  ', probeOk ? '✓ 8 adapters reported' : '✗');
const l = await run(['--list']);
const listOk = l.out.includes('"anthropic"') && l.out.includes('claude-haiku');
console.log('3. --list:   ', listOk ? '✓ canonical models listed' : '✗');

// stdio handshake
const proc = spawn('node', ['server.mjs'], { stdio: ['pipe','pipe','pipe'] });
const responses = [];
proc.stdout.on('data', d => {
  for (const line of d.toString().split('\n')) {
    if (line.trim()) { try { responses.push(JSON.parse(line)); } catch(_){} }
  }
});
const send = msg => proc.stdin.write(JSON.stringify(msg)+'\n');
send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2025-03-26', capabilities:{}, clientInfo:{ name:'test', version:'1.0' }}});
await setTimeout(500);
send({ jsonrpc:'2.0', id:2, method:'tools/list', params:{} });
await setTimeout(500);
proc.kill();
await setTimeout(200);

const initOk = responses.some(r => r.id===1 && r.result?.serverInfo?.name === 'fall-mcp-bridge');
const toolsOk = responses.some(r => r.id===2 && r.result?.tools?.length === 3);
console.log('4. MCP init: ', initOk ? '✓ serverInfo correct' : '✗');
console.log('5. tools/list:', toolsOk ? '✓ 3 tools (complete/list_models/probe)' : '✗');

const allOk = v.out.trim() && probeOk && listOk && initOk && toolsOk;
console.log('\n' + (allOk ? '✓ all smoke tests pass' : '✗ failures above'));
process.exit(allOk ? 0 : 1);
