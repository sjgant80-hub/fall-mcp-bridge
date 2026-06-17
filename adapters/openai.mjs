// OpenAI adapter · BYOK · GPT models (and OpenAI-compatible base URLs)

const DEFAULT_ENDPOINT = 'https://api.openai.com';

export async function complete({ model, prompt, system, temperature, max_tokens, apiKey, endpoint }) {
  if (!apiKey) throw new Error('openai: missing apiKey (set FALL_MCP_OPENAI_KEY or OPENAI_API_KEY)');
  const url = (endpoint || DEFAULT_ENDPOINT) + '/v1/chat/completions';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1024,
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text().catch(() => '')}`);
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

export async function listModels({ apiKey, endpoint } = {}) {
  if (!apiKey) return [];
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/v1/models', {
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(m => ({ id: m.id, family: 'openai' }));
  } catch {
    return [];
  }
}
