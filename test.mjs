#!/usr/bin/env node
// ============================================================================
// fall-mcp-bridge · unit test suite
//
// Every assertion below is derived from running the project's own adapter
// modules and observing their real return values / thrown errors. No network
// is required or performed: only the deterministic, offline code paths are
// exercised (argument validation, the canonical model list, boolean probes,
// and the adapter export contract). Run with `node test.mjs` (see package.json
// "test" script) — exit code is 0 on pass, non-zero on any failure.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as anthropic from './adapters/anthropic.mjs';
import * as openai from './adapters/openai.mjs';
import * as openrouter from './adapters/openrouter.mjs';
import * as ollama from './adapters/ollama.mjs';
import * as llamacpp from './adapters/llamacpp.mjs';
import * as mlx from './adapters/mlx.mjs';
import * as lmstudio from './adapters/lmstudio.mjs';
import * as femto from './adapters/femto.mjs';

const ALL_ADAPTERS = {
  anthropic, openai, openrouter, ollama, llamacpp, mlx, lmstudio, femto,
};

// --- adapter contract -------------------------------------------------------
// The README documents that every adapter exports three async functions:
// complete, probe, listModels. Verify the actual module exports honour it.
test('every adapter exports the complete/probe/listModels contract', () => {
  const names = Object.keys(ALL_ADAPTERS);
  assert.equal(names.length, 8, 'expected 8 adapters wired into the bridge');
  for (const [name, mod] of Object.entries(ALL_ADAPTERS)) {
    assert.equal(typeof mod.complete, 'function', `${name}.complete must be a function`);
    assert.equal(typeof mod.probe, 'function', `${name}.probe must be a function`);
    assert.equal(typeof mod.listModels, 'function', `${name}.listModels must be a function`);
  }
});

// --- anthropic.listModels: canonical, offline, deterministic ----------------
test('anthropic.listModels returns the canonical Claude family offline', async () => {
  const models = await anthropic.listModels();
  assert.ok(Array.isArray(models), 'listModels must return an array');
  assert.equal(models.length, 5, 'canonical Claude list has 5 entries');
  // family is uniform and the ids are unique
  assert.ok(models.every(m => m.family === 'anthropic'), 'every entry is family anthropic');
  const ids = models.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length, 'model ids are unique');
  assert.ok(ids.includes('claude-haiku-4-5'), 'includes the documented haiku id');
  const haiku = models.find(m => m.id === 'claude-haiku-4-5');
  assert.equal(haiku.tier, 'haiku', 'haiku entry is tagged tier=haiku');
});

// --- probe: reflects credential presence without any network round-trip -----
test('BYOK adapter probes reflect apiKey presence as a plain boolean', async () => {
  for (const mod of [anthropic, openai, openrouter]) {
    assert.equal(await mod.probe({ apiKey: 'sk-test' }), true, 'key present -> true');
    assert.equal(await mod.probe({}), false, 'no key -> false');
  }
});

// --- complete: BYOK adapters reject before any fetch when the key is absent --
test('anthropic.complete rejects with a keyed error when apiKey is missing', async () => {
  await assert.rejects(
    () => anthropic.complete({ prompt: 'hi' }),
    /anthropic: missing apiKey/,
    'must name the adapter and the missing credential',
  );
});

test('openai.complete rejects with a keyed error when apiKey is missing', async () => {
  await assert.rejects(
    () => openai.complete({ prompt: 'hi' }),
    /openai: missing apiKey/,
  );
});

test('openrouter.complete rejects with a keyed error when apiKey is missing', async () => {
  await assert.rejects(
    () => openrouter.complete({ prompt: 'hi' }),
    /openrouter: missing apiKey/,
  );
});

// --- femto: the unimplemented ws transport fails fast with a clear message ---
test('femto.complete refuses the not-yet-implemented ws transport', async () => {
  await assert.rejects(
    () => femto.complete({ prompt: 'hi', transport: 'ws' }),
    /ws transport not yet implemented/,
  );
});

// --- openai.listModels short-circuits to [] with no key (no network) --------
test('openai.listModels returns an empty list when no apiKey is supplied', async () => {
  const models = await openai.listModels({});
  assert.deepEqual(models, [], 'no key -> empty list, no request attempted');
});
