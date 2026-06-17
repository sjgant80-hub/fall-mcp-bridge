// OpenRouter adapter · BYOK · 100+ models via one endpoint
// Including Gemini, Llama, Mistral, Qwen, DeepSeek and more

const ENDPOINT = 'https://openrouter.ai/api/v1';

export async function complete({ model, prompt, system, temperature, max_tokens, apiKey }) {
  if (!apiKey) throw new Error('openrouter: missing apiKey (set FALL_MCP_OPENROUTER_KEY or OPENROUTER_API_KEY)');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch(ENDPOINT + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://sjgant80-hub.github.io/fall-mcp-bridge/',
      'X-Title': 'fall-mcp-bridge',
    },
    body: JSON.stringify({
      model: model || 'anthropic/claude-haiku-4-5',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1024,
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content || '',
    model_used: data.model || model,
    tokens_in: data.usage?.prompt_tokens ?? null,
    tokens_out: data.usage?.completion_tokens ?? null,
  };
}

export async function probe({ apiKey } = {}) {
  return !!apiKey;
}

export async function listModels({ apiKey } = {}) {
  try {
    const res = await fetch(ENDPOINT + '/models', {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).slice(0, 200).map(m => ({ id: m.id, family: 'openrouter', context: m.context_length }));
  } catch {
    return [];
  }
}
