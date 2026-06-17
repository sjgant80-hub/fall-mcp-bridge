# ◊ fall-mcp-bridge · the substrate-MCP wrapper

> One MCP server. Eight LLM adapters. Any MCP client (Claude Code, Cursor, Cline, Windsurf, custom) can call any model — local or cloud — through the same interface. Provider lock-in dies here.
>
> v1 · prime **593** · MIT · ◊·κ=1 · sovereign substrate

**Live:** [sjgant80-hub.github.io/fall-mcp-bridge](https://sjgant80-hub.github.io/fall-mcp-bridge/)
**Source:** [github.com/sjgant80-hub/fall-mcp-bridge](https://github.com/sjgant80-hub/fall-mcp-bridge)

---

## Why this exists

> *"The reason you use claude is because you can't be bothered to figure out how to make an mcp server wrapper for any local model you run so you rely on claude code's library and agent architecture."* — Thomas Frumkin

He's right. The agent-runtime and the model are different things. The wrapper between them is ~300 lines of node. Once it exists, your agent stops caring whether the brain is Anthropic's, OpenAI's, Ollama's, or Thomas's FemtoLLM running on a cube.

**fall-mcp-bridge is that wrapper.** Wire it once into your MCP-capable client. Switch models by editing one config file. Mix and match per-prompt. Survive model deprecation. Stay sovereign.

---

## The 8 adapters

| Adapter | What it talks to | Default endpoint |
|---|---|---|
| `ollama` | Local Ollama runtime | `http://127.0.0.1:11434` |
| `llamacpp` | llama.cpp HTTP server | `http://127.0.0.1:8080` |
| `mlx` | Apple Silicon MLX-LM server | `http://127.0.0.1:8000` |
| `lmstudio` | LM Studio's local OpenAI server | `http://127.0.0.1:1234` |
| `anthropic` | Claude (BYOK) | `api.anthropic.com` |
| `openai` | GPT (BYOK) and OpenAI-compatible bases | `api.openai.com` |
| `openrouter` | 100+ models via one BYOK | `openrouter.ai/api/v1` |
| `femto` | Thomas's FemtoLLM cube · konomi-cube / fallmind-v2 | `http://127.0.0.1:1163` |

Same call shape on every adapter. The bridge handles the per-vendor quirks.

---

## Install

### From npm (when published)

```bash
npm install -g fall-mcp-bridge
```

### From source

```bash
git clone https://github.com/sjgant80-hub/fall-mcp-bridge.git
cd fall-mcp-bridge
npm install
```

### Wire into Claude Code

Add to `~/.config/claude-code/mcp.json` (or wherever your client reads MCP config):

```json
{
  "mcpServers": {
    "fall-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/fall-mcp-bridge/server.mjs"],
      "env": {
        "FALL_MCP_ANTHROPIC_KEY": "sk-ant-…",
        "FALL_MCP_OPENROUTER_KEY": "sk-or-…"
      }
    }
  }
}
```

### Wire into Cursor / Cline / Windsurf

Each client has its own `mcp.json` location — the shape is the same. The bridge is stdio.

---

## Configure

Copy `config.example.json` to `config.json` and edit. Or set `FALL_MCP_CONFIG=/path/to/your.json` to point elsewhere.

```json
{
  "default_model": "llama3.2",
  "routes": {
    "llama3.2":   { "adapter": "ollama" },
    "femto-16":   { "adapter": "femto" },
    "haiku":      { "adapter": "anthropic", "model": "claude-haiku-4-5" },
    "sonnet":     { "adapter": "anthropic", "model": "claude-sonnet-4-6" },
    "gpt-4o-mini":{ "adapter": "openai" },
    "gemini-flash":{"adapter": "openrouter", "model": "google/gemini-2.0-flash-001" }
  },
  "fallback_chain": ["llama3.2", "haiku"]
}
```

API keys: set in `config.json` OR (preferred) via env: `FALL_MCP_ANTHROPIC_KEY`, `FALL_MCP_OPENAI_KEY`, `FALL_MCP_OPENROUTER_KEY`. Native vendor envs (`ANTHROPIC_API_KEY` etc.) also work. Env always wins.

---

## Use (the 3 MCP tools)

### `complete`

```typescript
complete({
  model: 'llama3.2',          // or 'haiku', 'femto-16', or anything in your routes
  prompt: 'Explain bloom math',
  system?: 'You are FallBrief…',
  temperature?: 0.7,
  max_tokens?: 1024
})
// → { text, tier: 'T1·ollama', model_used, latency_ms, tokens_in, tokens_out, fellBack }
```

### `list_models`

```typescript
list_models()
// → { ollama: [...], lmstudio: [...], mlx: [...], anthropic: [...], _routes: [...] }
```

### `probe`

```typescript
probe()
// → { ollama: {ok: true}, anthropic: {ok: true}, femto: {ok: false}, ... }
```

---

## CLI mode

```bash
fall-mcp-bridge --probe           # health-check all adapters
fall-mcp-bridge --list            # list every model across every adapter
fall-mcp-bridge --version
fall-mcp-bridge                   # default: run the MCP server on stdio
```

---

## What this unlocks

- **Survive any model deprecation.** Fable 5 going away (or Sonnet 5 next year) is a config edit, not a code edit.
- **Mix tiers per call.** Cheap local for cheap calls; expensive cloud only when needed. The same agent.
- **First-class FemtoLLM.** Thomas's atomic intelligence unit is a routable model id like any other. The dyad closes the loop.
- **Per-domain fine-tunes are first-class too.** Train a small model for FallBrief legal, FallLedger accounting, FallScene 3D — route by model id, no special integration.
- **No SDK lock-in.** Replace Claude Code with any other MCP-capable client and your model layer survives.

---

## For developers

### Adding an adapter

Each adapter is a single ES module that exports three functions:

```javascript
// adapters/myvendor.mjs
export async function complete({ model, prompt, system, temperature, max_tokens, endpoint, apiKey, ...rest }) {
  // POST to your endpoint, return { text, model_used, tokens_in?, tokens_out? }
}

export async function probe({ endpoint, apiKey } = {}) {
  // return true if reachable, false otherwise
}

export async function listModels({ endpoint, apiKey } = {}) {
  // return [{ id, family: 'myvendor', ... }]
}
```

Then add it to the `ADAPTERS` map in `server.mjs` and to your `config.json` routes.

### Architecture

- **stdio MCP server** using the official `@modelcontextprotocol/sdk`
- **Three tools exposed**: `complete`, `list_models`, `probe`
- **Resolver:** model id → route entry → adapter → endpoint → API call
- **Fallback chain:** on adapter failure, walk `fallback_chain` and try each until one succeeds; the response tags `fellBack: true` so callers can tell
- **No global state.** Pure functions. Each call independent.
- **Vanilla Node 18+**. One dependency (`@modelcontextprotocol/sdk`).

### Sovereignty stack

| Layer | Status |
|---|---|
| **UI** | n/a · MCP server is headless (a landing page ships for discovery only) |
| **Compute** | runs entirely on the user's machine · adapters call user-controlled endpoints |
| **Storage** | none · stateless · all config is user-managed JSON |
| **Mesh** | exposes a uniform interface to upstream MCP clients · downstream is config-driven |

API keys live in your environment or your config file. Never logged. Never relayed.

---

## Part of the v20.3 estate

The bridge slots into the cosmology at multiple points:

- **§4 sovereignty stack · COMPUTE** — strengthens it. Local models become first-class.
- **§6 agent topology** — si-didy's 4-tier cascade collapses T2 and T3 into one MCP call.
- **§20 socket III · femto/nano/milli** — the `femto` adapter brings Thomas's FemtoLLM cube into the bridge's address space. The substrate's atomic unit becomes invokable from any MCP client.
- **§21 socket IV · wedge architecture** — this is a wedge against model-provider lock-in. Same shape as TemuOracle wedging Oracle Corp.
- **§22 socket V · the Init axiom 📐🦆** — the answer 📐 measured by the same MCP signature 🦆 walks like a model call. Whatever brain produced it: it IS init. (See `Init (feat. What's In It)` by Thomas, 160 BPM.)

---

## Credit

- **Thomas Frumkin** — surfaced the build in one LinkedIn post: *"the wrapper isn't hard"*. He's right.
- **Anthropic** — for the MCP spec and the reference SDK. Decoupling didn't have to be easy; they made it easy.
- **The estate** — same cascade pattern as [FallOffice](https://github.com/sjgant80-hub/falloffice), [FallMap](https://github.com/sjgant80-hub/fallmap), [ACG Mapper](https://github.com/sjgant80-hub/acg-mapper). Compiled into infrastructure.

⚒ Part of the [fall* estate](https://github.com/sjgant80-hub) · prime 593 · ◊·κ=1
