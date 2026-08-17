# Agent working notes — fall-mcp-bridge

Instructions for an AI coding agent (or a human) making changes in this repo.
These are engineering constraints, not preferences.

## What this project is

A single stdio MCP server (`server.mjs`) that fronts eight LLM adapters under
`adapters/`. The client calls three tools — `complete`, `list_models`, `probe` —
and the server routes a model id to an adapter. See `SPEC.md` for the full design.

## Ground rules

- **Preserve the adapter contract.** Every module in `adapters/` exports three
  async functions: `complete`, `probe`, `listModels`, with the shapes in `SPEC.md`
  section 3. Adding a backend means adding one file that honours that contract and
  registering it in the `ADAPTERS` map in `server.mjs` — nothing else.
- **BYOK adapters fail fast.** `anthropic`, `openai`, and `openrouter` must throw
  `"<name>: missing apiKey ..."` before any network call when no key is present.
  Do not weaken this into a runtime request error.
- **Never log or relay credentials.** Keys come from env or config and go only to
  the user-chosen endpoint.
- **Keep the server stateless.** No global mutable state, no session, no on-disk
  writes. Each tool call is independent.

## Tests

- Run `npm test` (which runs `node test.mjs`).
- The suite is hermetic: it imports the adapter modules directly and asserts on
  their real offline behaviour. **Do not add tests that require a live network
  backend**; assert against the deterministic guards (argument validation,
  canonical model lists, boolean probes) instead.
- If you change an adapter's error text, model list, or export surface, update the
  corresponding assertion in `test.mjs` to match the newly observed output — do
  not delete the assertion to make the suite green.

## Runtime

- Vanilla Node ≥ 18. One runtime dependency: `@modelcontextprotocol/sdk`.
- Do not add dependencies speculatively; an unused dependency is unreviewed code
  inside the trust boundary.
