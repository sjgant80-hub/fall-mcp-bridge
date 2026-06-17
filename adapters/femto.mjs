// FemtoLLM adapter · the substrate dyad (Thomas / sjgant80-hub konomi-cube)
//
// FemtoLLM is the atomic intelligence unit: 16-dim · 1 layer · 1 head · ~4KB state.
// Per v20.3 §20, a Cube = 9 FemtoLLMs at the 9 nodes (8 vertices + 1 central).
//
// Integration shapes (in order of preference):
//
// 1) HTTP server mode · konomi-cube or fallmind-v2 runs a small HTTP endpoint
//    exposing POST /v1/chat/completions in OpenAI-compatible shape.
//    Default endpoint: http://127.0.0.1:1163  (prime 1163 = fallmind-v2)
//
// 2) WebSocket bridge mode · the cube broadcasts via fall-signal in a browser
//    tab; we connect from Node via a WS bridge.
//    Enable by setting config.adapters.femto.transport = 'ws' and endpoint to ws://...
//
// 3) Stub mode · if the cube isn't running, we return a clear stub response
//    so callers can detect and degrade gracefully.

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1163';

export async function complete({ model, prompt, system, temperature, max_tokens, endpoint, transport }) {
  const ep = endpoint || DEFAULT_ENDPOINT;
  if (transport === 'ws') {
    throw new Error('femto: ws transport not yet implemented · use http mode by running fallmind-v2 with --serve');
  }
  try {
    const url = ep + '/v1/chat/completions';
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'femto-16',
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 1024,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`femto ${res.status}: ${await res.text().catch(() => '')}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content || '',
      model_used: data.model || model || 'femto-16',
      tokens_in: data.usage?.prompt_tokens ?? null,
      tokens_out: data.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    throw new Error(`femto unreachable at ${ep} · is konomi-cube / fallmind-v2 running? · ${e.message}`);
  }
}

export async function probe({ endpoint } = {}) {
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/v1/models', {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels({ endpoint } = {}) {
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/v1/models', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(m => ({ id: m.id, family: 'femto' }));
  } catch {
    // graceful: return the canonical femto family even when offline
    return [
      { id: 'femto-16', family: 'femto', state_size: '~4KB', note: 'cube not running · canonical id only' },
    ];
  }
}
