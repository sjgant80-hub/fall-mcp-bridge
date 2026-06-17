// llama.cpp server adapter · uses OpenAI-compatible /v1/chat/completions
// Default endpoint: http://127.0.0.1:8080

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8080';

export async function complete({ model, prompt, system, temperature, max_tokens, endpoint }) {
  const url = (endpoint || DEFAULT_ENDPOINT) + '/v1/chat/completions';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'default',
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1024,
    }),
  });
  if (!res.ok) throw new Error(`llamacpp ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    text: choice?.message?.content || '',
    model_used: data.model || model,
    tokens_in: data.usage?.prompt_tokens ?? null,
    tokens_out: data.usage?.completion_tokens ?? null,
  };
}

export async function probe({ endpoint } = {}) {
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/health', {
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
    return (data.data || []).map(m => ({ id: m.id, family: 'llamacpp' }));
  } catch {
    return [];
  }
}
