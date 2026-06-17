// Anthropic adapter · BYOK · Claude models
// Endpoint fixed · model id required (e.g. claude-haiku-4-5, claude-sonnet-4-6)

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export async function complete({ model, prompt, system, temperature, max_tokens, apiKey }) {
  if (!apiKey) throw new Error('anthropic: missing apiKey (set FALL_MCP_ANTHROPIC_KEY or ANTHROPIC_API_KEY)');
  const body = {
    model: model || 'claude-haiku-4-5',
    max_tokens: max_tokens ?? 1024,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return {
    text: (data.content || []).map(c => c.text || '').join('').trim(),
    model_used: data.model || model,
    tokens_in: data.usage?.input_tokens ?? null,
    tokens_out: data.usage?.output_tokens ?? null,
  };
}

export async function probe({ apiKey } = {}) {
  return !!apiKey;
}

export async function listModels() {
  // Anthropic doesn't expose /models; return the canonical list
  return [
    { id: 'claude-opus-4-8', family: 'anthropic', tier: 'opus' },
    { id: 'claude-opus-4-7', family: 'anthropic', tier: 'opus' },
    { id: 'claude-sonnet-4-6', family: 'anthropic', tier: 'sonnet' },
    { id: 'claude-haiku-4-5', family: 'anthropic', tier: 'haiku' },
    { id: 'claude-fable-5', family: 'anthropic', tier: 'fable' },
  ];
}
