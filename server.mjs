#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// fall-mcp-bridge · uniform MCP front for any LLM
// ◊·κ=1 · prime 593 · MIT · sovereign substrate
//
// One MCP server. Eight adapters. Any client (Claude Code, Cursor,
// Cline, Windsurf, custom) can call any model — local or cloud —
// through the same interface. Provider lock-in dies here.
// ════════════════════════════════════════════════════════════════

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ollama from './adapters/ollama.mjs';
import * as llamacpp from './adapters/llamacpp.mjs';
import * as mlx from './adapters/mlx.mjs';
import * as lmstudio from './adapters/lmstudio.mjs';
import * as anthropic from './adapters/anthropic.mjs';
import * as openai from './adapters/openai.mjs';
import * as openrouter from './adapters/openrouter.mjs';
import * as femto from './adapters/femto.mjs';

const VERSION = '1.0.0';
const PRIME = 593;
const NAME = 'fall-mcp-bridge';

const ADAPTERS = { ollama, llamacpp, mlx, lmstudio, anthropic, openai, openrouter, femto };

// ── config load ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = process.env.FALL_MCP_CONFIG || join(__dirname, 'config.json');
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  // fallback to example
  const examplePath = join(__dirname, 'config.example.json');
  if (existsSync(examplePath)) {
    config = JSON.parse(readFileSync(examplePath, 'utf8'));
    console.error(`[fall-mcp-bridge] no config.json · using config.example.json · set FALL_MCP_CONFIG to override`);
  } else {
    console.error(`[fall-mcp-bridge] no config file found · using defaults`);
    config = { default_model: 'llama3.2', routes: {}, fallback_chain: [] };
  }
}

// ── CLI modes ──
const args = process.argv.slice(2);
if (args.includes('--probe')) {
  const results = await probeAll();
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}
if (args.includes('--list')) {
  const models = await listAllModels();
  console.log(JSON.stringify(models, null, 2));
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  console.log(`fall-mcp-bridge v${VERSION} · prime ${PRIME} · ◊·κ=1`);
  process.exit(0);
}

// ── core operations ──
async function probeAll() {
  const results = {};
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    const cfg = adapterConfig(name);
    try {
      const ok = await adapter.probe(cfg);
      results[name] = { ok, endpoint: cfg.endpoint || cfg.api || null };
    } catch (e) {
      results[name] = { ok: false, error: e.message };
    }
  }
  return results;
}

async function listAllModels() {
  const out = {};
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    const cfg = adapterConfig(name);
    try {
      out[name] = await adapter.listModels(cfg);
    } catch (e) {
      out[name] = { error: e.message };
    }
  }
  // also include explicit routes from config
  out._routes = Object.keys(config.routes || {});
  return out;
}

function adapterConfig(adapterName) {
  // pull adapter-level config (endpoints, API keys) from env or config
  const env = process.env;
  const c = (config.adapters && config.adapters[adapterName]) || {};
  return {
    endpoint: c.endpoint,
    apiKey: c.apiKey
      || env[`FALL_MCP_${adapterName.toUpperCase()}_KEY`]
      || env[`${adapterName.toUpperCase()}_API_KEY`],
    ...c,
  };
}

function resolveRoute(modelId) {
  // explicit route in config?
  if (config.routes && config.routes[modelId]) {
    const r = config.routes[modelId];
    return { adapter: r.adapter, model: r.model || modelId, endpoint: r.endpoint, apiKey: r.apiKey };
  }
  // heuristic: prefix-based
  if (/^claude/i.test(modelId)) return { adapter: 'anthropic', model: modelId };
  if (/^gpt|^o[0-9]|^text-/i.test(modelId)) return { adapter: 'openai', model: modelId };
  if (/^gemini/i.test(modelId)) return { adapter: 'openrouter', model: 'google/' + modelId };
  if (/^femto/i.test(modelId)) return { adapter: 'femto', model: modelId };
  // default fallback: try ollama
  return { adapter: 'ollama', model: modelId };
}

async function callComplete({ model, prompt, system, temperature, max_tokens, stream }) {
  const targetModel = model || config.default_model || 'llama3.2';
  const route = resolveRoute(targetModel);
  const adapter = ADAPTERS[route.adapter];
  if (!adapter) {
    throw new McpError(ErrorCode.InvalidRequest, `unknown adapter: ${route.adapter}`);
  }
  const adapterCfg = adapterConfig(route.adapter);
  const merged = {
    endpoint: route.endpoint || adapterCfg.endpoint,
    apiKey: route.apiKey || adapterCfg.apiKey,
    ...adapterCfg,
  };
  const started = Date.now();
  let result;
  try {
    result = await adapter.complete({
      model: route.model,
      prompt,
      system,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1024,
      ...merged,
    });
  } catch (e) {
    // fallback chain?
    const chain = config.fallback_chain || [];
    for (const fbModel of chain) {
      if (fbModel === targetModel) continue;
      try {
        const fbRoute = resolveRoute(fbModel);
        const fbAdapter = ADAPTERS[fbRoute.adapter];
        const fbCfg = adapterConfig(fbRoute.adapter);
        result = await fbAdapter.complete({
          model: fbRoute.model,
          prompt,
          system,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 1024,
          endpoint: fbRoute.endpoint || fbCfg.endpoint,
          apiKey: fbRoute.apiKey || fbCfg.apiKey,
          ...fbCfg,
        });
        return wrapResult(result, fbRoute.adapter, fbRoute.model, started, true);
      } catch (_) { /* try next */ }
    }
    throw new McpError(ErrorCode.InternalError, `complete failed: ${e.message}`);
  }
  return wrapResult(result, route.adapter, route.model, started, false);
}

function wrapResult(result, adapter, model, started, fellBack) {
  return {
    text: result.text || '',
    tier: 'T1·' + adapter,
    adapter,
    model_used: result.model_used || model,
    latency_ms: Date.now() - started,
    tokens_in: result.tokens_in ?? null,
    tokens_out: result.tokens_out ?? null,
    fellBack,
  };
}

// ── MCP server ──
const server = new Server(
  { name: NAME, version: VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'complete',
      description: 'Generate text from any configured LLM. Routes by model id through 8 adapters (ollama/llamacpp/mlx/lmstudio/anthropic/openai/openrouter/femto). Falls back through fallback_chain if the primary fails.',
      inputSchema: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Model id (e.g. "llama3.2", "claude-haiku-4-5", "gpt-4o-mini", "femto-16"). Defaults to config.default_model.' },
          prompt: { type: 'string', description: 'User prompt.' },
          system: { type: 'string', description: 'Optional system prompt.' },
          temperature: { type: 'number', description: 'Sampling temperature 0-2. Default 0.7.', minimum: 0, maximum: 2 },
          max_tokens: { type: 'integer', description: 'Max output tokens. Default 1024.', minimum: 1 },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'list_models',
      description: 'List all models available across configured adapters. Returns map of adapter → models[].',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'probe',
      description: 'Health-check every adapter. Returns map of adapter → {ok, endpoint?, error?}. Use this to see which backends are reachable.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === 'complete') {
      const result = await callComplete(args || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'list_models') {
      const result = await listAllModels();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    if (name === 'probe') {
      const result = await probeAll();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw new McpError(ErrorCode.InternalError, e.message);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[fall-mcp-bridge] v${VERSION} · prime ${PRIME} · ready on stdio`);
