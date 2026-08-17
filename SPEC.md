# fall-mcp-bridge — design note

Status: accepted

This is the durable design record for `fall-mcp-bridge`. Where this note and the
code disagree, that is a bug in one of them.

## 1 · Problem

An MCP-capable client (Claude Code, Cursor, Cline, Windsurf, or a custom host)
speaks one protocol but each model provider speaks its own HTTP dialect. Wiring
a new backend into an agent means writing provider-specific glue every time, and
switching models means editing code. The goal is to make the *model* a
config-level choice, not a code-level one.

## 2 · Shape

A single stdio MCP server sits in front of N backend adapters. The client always
calls the same three tools; the server resolves a model id to an adapter and
forwards the call.

```
MCP client ──stdio──▶ server.mjs ──▶ resolveRoute(modelId) ──▶ adapters/<name>.mjs ──▶ backend HTTP
```

- Transport: stdio, via the official `@modelcontextprotocol/sdk`.
- The server is headless and stateless. Each tool call is independent; there is
  no session or cross-call state.

## 3 · The adapter contract

Every file under `adapters/` is an ES module exporting exactly three async
functions. This is the single extension point of the system.

| export | input | output |
|---|---|---|
| `complete` | `{ model, prompt, system?, temperature?, max_tokens?, endpoint?, apiKey? }` | `{ text, model_used, tokens_in?, tokens_out? }` |
| `probe` | `{ endpoint?, apiKey? }` | `boolean` (reachable / credentialed) |
| `listModels` | `{ endpoint?, apiKey? }` | array of `{ id, family, ... }` |

Invariants a conforming adapter must hold:

- **Fail fast on missing credentials.** A BYOK adapter (`anthropic`, `openai`,
  `openrouter`) throws a keyed error (`"<name>: missing apiKey ..."`) before any
  network call when no `apiKey` is supplied. This keeps a misconfiguration cheap
  and legible instead of surfacing as an opaque request failure.
- **Degrade, do not crash, on an unreachable backend.** `probe` returns `false`
  and `listModels` returns `[]` (or a documented canonical fallback) when the
  backend is down, rather than throwing.
- **`probe` performs no mutation** and is safe to call on every backend for a
  health sweep.

The eight adapters shipped: `ollama`, `llamacpp`, `mlx`, `lmstudio` (local
runtimes), `anthropic`, `openai`, `openrouter` (BYOK cloud), and `femto` (a
local OpenAI-compatible endpoint with a canonical-id offline fallback).

## 4 · Routing

`resolveRoute(modelId)` maps a model id to `{ adapter, model, endpoint?, apiKey? }`:

1. An explicit entry in `config.routes[modelId]` wins.
2. Otherwise a prefix heuristic applies (`claude*`→anthropic, `gpt*`/`o**`→openai,
   `gemini*`→openrouter, `femto*`→femto).
3. The default is the local `ollama` adapter.

Credentials are resolved per adapter from, in order: an explicit route field, a
config `adapters.<name>` block, `FALL_MCP_<NAME>_KEY`, then the native vendor env
(`<NAME>_API_KEY`). Environment always wins over the config file. Keys are never
logged and never relayed.

## 5 · Fallback chain

If the primary `complete` throws, the resolver walks `config.fallback_chain`,
skipping the model that just failed, and tries each in turn. The first success
returns with `fellBack: true` so a caller can tell the response did not come from
the requested model. If the whole chain is exhausted the original error is
surfaced as an MCP `InternalError`.

## 6 · The three MCP tools

- `complete` — generate text from any routed model. Wraps the adapter result
  with `{ tier, adapter, model_used, latency_ms, tokens_in, tokens_out, fellBack }`.
- `list_models` — a map of adapter → available models, plus the configured routes.
- `probe` — a health map of adapter → `{ ok, endpoint?, error? }`.

## 7 · Verification strategy

The design deliberately concentrates all deterministic logic (argument
validation, the canonical model list, the boolean probe, the export contract) in
paths that need no network. `test.mjs` imports the adapter modules directly and
asserts against their real, observed return values and thrown errors — so the
suite exercises the project's own code, runs offline, and is reproducible in CI.
Network-bound completion paths are validated by their pre-flight guards rather
than by contacting a live backend, which keeps the suite hermetic.

## 8 · Non-goals

- Not a model server. It ships no weights and runs no inference itself.
- Not a persistence layer. All configuration is user-managed JSON; there is no
  database and no on-disk state.
- Not a security boundary. Credential handling is limited to reading from env or
  config and forwarding on the wire to the user-chosen endpoint.
