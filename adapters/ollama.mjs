// Ollama adapter · local LLMs via the standard Ollama HTTP API
// Default endpoint: http://127.0.0.1:11434

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

export async function complete({ model, prompt, system, temperature, max_tokens, endpoint }) {
  const url = (endpoint || DEFAULT_ENDPOINT) + '/api/generate';
  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: temperature ?? 0.7,
      num_predict: max_tokens ?? 1024,
    },
  };
  if (system) body.system = system;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return {
    text: data.response || '',
    model_used: data.model || model,
    tokens_in: data.prompt_eval_count ?? null,
    tokens_out: data.eval_count ?? null,
  };
}

export async function probe({ endpoint } = {}) {
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels({ endpoint } = {}) {
  try {
    const res = await fetch((endpoint || DEFAULT_ENDPOINT) + '/api/tags', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => ({ id: m.name, family: 'ollama', size: m.size }));
  } catch {
    return [];
  }
}
