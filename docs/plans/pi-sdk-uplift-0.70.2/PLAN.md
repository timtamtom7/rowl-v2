# Pi SDK Uplift 0.66.1 → 0.70.2 — Implementation Plan

> **Goal:** Port upstream v0.8.12's Pi SDK uplift and critical bug fixes so Pi-backed sessions (OpenAI, Codex, ChatGPT Plus, etc.) have working custom tools, correct model routing, and reliable compaction.
> **Risk:** Medium — SDK reshape changes tool registration contract; upstream already validated but our fork may have drift.
> **Duration:** 2–3 hours + smoke test
> **Branch:** `fix/pi-sdk-0.70.2-uplift`

---

## Why this matters

Pi SDK 0.70.0 silently reshaped `CreateAgentSessionOptions.tools` from `AgentTool[]` to `string[]` name allowlist. Our code passes objects, so `allowedToolNames = new Set(objects)` and `.has(name)` returns `false` for every lookup. **Every custom tool is filtered out.** Pi sessions currently only have built-in `[read, bash, edit, write]` — no MCP tools, no session-scoped tools, no skills.

Additionally:
- `call_llm` ignores `request.model` and runs on stale mini model
- `handleMiniCompletion` fails with "No API key found for openai" for non-Anthropic providers
- `/compact` times out after 60s on GPT-backed sessions

---

## Changes by file

### 1. Package versions (5 files, 5 min)

| File | Change |
|---|---|
| `package.json` (root) | `@mariozechner/pi-ai` `^0.66.1` → `^0.70.2`; `@mariozechner/pi-coding-agent` `^0.66.1` → `^0.70.2` |
| `packages/pi-agent-server/package.json` | `pi-coding-agent` `0.66.1` → `0.70.2`; `pi-agent-core` `0.66.1` → `0.70.2`; `pi-ai` `0.66.1` → `0.70.2` |
| `packages/server-core/package.json` | `pi-ai` `0.66.1` → `0.70.2` |
| `packages/shared/package.json` | `pi-agent-core` `0.66.1` → `0.70.2`; `pi-ai` `0.66.1` → `0.70.2`; `pi-coding-agent` `0.66.1` → `0.70.2` |

Then run `bun install` to update `bun.lock`.

### 2. Pi agent server — tool registration rewrite (`packages/pi-agent-server/src/index.ts`, 30 min)

**Remove:**
- Import `codingTools` (removed from SDK)
- Import `AgentTool` from `pi-agent-core` (no longer needed)
- `_baseToolsOverride` + `_buildRuntime` hack (no longer needed with new SDK)

**Add imports:**
- `createReadToolDefinition`, `createBashToolDefinition`, `createEditToolDefinition`, `createWriteToolDefinition`
- `createGrepToolDefinition`, `createFindToolDefinition`, `createLsToolDefinition`
- `AuthCredential` type
- `pickProviderAppropriateMiniModel` (new local helper)

**Change `ensureSession()`:**
- Replace `codingTools` with `create*ToolDefinition(cwd)` calls
- Build `builtinDefs` array
- `wrapToolsWithHooks([...builtinDefs, ...webTools, ...proxyTools])`
- Extract `toolAllowlist = wrappedAll.map(t => t.name)`
- Pass `customTools: wrappedAll` + `tools: toolAllowlist` to `createAgentSession`
- Remove `_baseToolsOverride` / `_buildRuntime` post-session hack

**Add `llm_query` RPC handler:**
- New inbound message type `llm_query`
- New outbound message type `llm_query_result`
- Handler delegates to model-aware `queryLlm()` (not `mini_completion`)

**Change `wrapToolsWithHooks` / `wrapSingleTool` signatures:**
- `AgentTool<any>` → `ToolDefinition<any, any>`

### 3. Pi agent server — mini model picker (`packages/pi-agent-server/src/pick-mini-model.ts`, 10 min)

**New file.** Walks `PI_PREFERRED_DEFAULTS[authProvider]` and returns first resolvable, non-denied candidate. Falls back to `getDefaultSummarizationModel()` if none found.

**Integration:** Call from `handleMiniCompletion` before falling back to Haiku.

### 4. Pi agent server — regression test (`packages/pi-agent-server/src/session-tool-registration.test.ts`, 10 min)

**New file.** Verifies that every `customTools[].name` is in the `tools` allowlist. Prevents next SDK uplift from silently dropping tools.

### 5. Pi agent server — model resolution update (`packages/pi-agent-server/src/model-resolution.ts`, 10 min)

Upstream added `isDeniedMiniModelId` helper. Check if our current `model-resolution.ts` already has it or if we need to port.

### 6. Shared — Pi agent (`packages/shared/src/agent/pi-agent.ts`, 30 min)

**Add `llm_query` support:**
- New `pendingLlmQueries` map
- Send `llm_query` RPC (not `mini_completion`) from `queryLlm()`
- Handle `llm_query_result` in event adapter
- Cleanup on subprocess exit / error

**Compact timeout:**
- `timeoutMs = 60_000` → `300_000` (5 min)

**Source activation restart:**
- After `source_test` activates a source, yield `source_activated` event
- Consume in `chatImpl` loop to trigger turn abort + auto-retry
- Same pattern already exists in ClaudeAgent

**Reject pending LLM queries on subprocess crash:**
- Iterate `pendingLlmQueries` in subprocess exit handler

### 7. Shared — config updates (`packages/shared/src/config/`, 15 min)

**`models-pi.ts` or `llm-connections.ts`:**
- Add GPT-5.5 to `PI_PREFERRED_DEFAULTS` for `openai` and `openai-codex`
- Add DeepSeek provider (`deepseek-v4-pro`, `deepseek-v4-flash`)
- Add `deepseek.com` to `PI_AUTH_PROVIDER_DOMAINS`

**`provider-metadata.ts`:**
- Add DeepSeek dashboard URL

### 8. Shared — URL safety (bonus, 10 min)

**New file:** `packages/shared/src/utils/url-safety.ts`
- Blocklist approach: block `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`
- Allow everything else (including `obsidian://`, `vscode://`, `zed://`)

**Integrate:** Replace allowlist with `url-safety` in markdown link handler.

### 9. Smoke test (30 min)

**Test matrix:**
1. Start Pi-backed session (OpenAI API key)
2. Verify custom tools are listed in agent capabilities
3. Run `call_llm` with explicit model → verify correct model is used
4. Run `/compact` on large conversation → verify no timeout
5. Verify mini-completion works without "No API key found for openai"

---

## Rollback plan

If smoke test fails:
1. Revert package.json changes
2. Restore `bun.lock` from backup
3. Revert code changes per file
4. The `_baseToolsOverride` hack still works on 0.66.1, so reverting is safe

---

## Locked decisions

- **Pi SDK exact versions pinned** in `pi-agent-server/package.json` (`0.70.2`, not `^0.70.2`) to prevent future silent reshapes
- **Root and shared use `^0.70.2`** for deduplication (Bun hoists to root)
- **Claude Agent SDK stays at `0.2.111`** — upstream pinned back after `0.2.119` broke Claude sessions with native binaries
- **No `_baseToolsOverride` hack** — the new `customTools` + `tools` allowlist is the canonical SDK path
