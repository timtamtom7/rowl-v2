# Mid-Session AI Provider Switching — Brainstorm

**Status:** 🟡 Brainstorm in progress — no spec, no plan, no code yet.
**Started:** 2026-04-21
**Sub-project:** Cross-cutting platform capability
**Roadmap row:** TBD — propose adding to `docs/ROADMAP.md`
**This doc is a living working document.** Both human and agent edit it freely. When the brainstorm settles, it graduates into `SPEC.md` and this file becomes a historical artifact.

---

## Purpose

Scope the ability for a user to switch LLM providers **mid-conversation** — i.e., after messages have been exchanged in a session. Today, Rowl locks the session to its initial connection on first message (`connectionLocked = true` in `SessionManager`). This is a product limitation, not a technical impossibility. This brainstorm figures out what it would take to remove that limitation and what trade-offs we'd accept.

**User story:** *"I'm 10 messages deep in a Claude session and hit a rate limit. I want to switch to my OpenRouter backup without losing context, restarting the app, or creating a new session."*

**Related pain points that make this feel urgent:**
- Rate limits on one provider → total workflow halt
- A model on Provider A hallucinates on a specific task → want to try Provider B's equivalent on the *same* thread
- Budget management — switch from expensive to cheap provider for follow-up questions
- A/B testing models across providers on the *same* conversation

---

## Why It's Hard (The Lock Exists for a Reason)

### 1. Agent Instance Is Provider-Specific

Each backend is a completely different agent implementation:

| Backend | Runtime | Session State Format | Auth Model |
|---------|---------|---------------------|------------|
| **Pi** (`PiAgent`) | Node subprocess running `@mariozechner/pi-coding-agent` | Pi SDK `.jsonl` session files | API key or OAuth per provider |
| **Claude** (`ClaudeAgent`) | Node subprocess running Claude CLI | Claude CLI `.claude.json` + project hashes | OAuth (Claude Code) |
| **Copilot** (`CopilotAgent`) | In-process, direct HTTP to Copilot API | Copilot API thread IDs | GitHub OAuth |
| **Codex** (`CodexAgent`) | Node subprocess running Codex CLI | Codex CLI session files | OpenAI OAuth |

Switching providers means **destroying the current agent instance** and creating a new one of a different class. The old agent's in-memory state (pending tool calls, streaming buffers, event queues) is lost.

### 2. Conversation History Format Is Provider-Native

Each provider stores history in its own format:
- **Anthropic messages API**: `role: 'user' | 'assistant'` with `content` arrays of `type: 'text' | 'image'`
- **OpenAI chat completions**: `role: 'user' | 'assistant' | 'system'` with string or array `content`
- **Pi SDK**: Internal `AgentMessage` objects with tool call metadata, reasoning blocks, etc.
- **Claude CLI**: Proprietary JSONL with `UserMessage`, `AssistantMessage`, `ToolUseBlock`, `ToolResultBlock`

There is **no canonical interchange format** in Rowl today. `Message` (in `core/src/types/message.ts`) is a display format, not a round-trippable LLM input format.

### 3. Tool Definitions Differ Per Provider

- Anthropic uses `input_schema` (JSON Schema)
- OpenAI uses `parameters` (JSON Schema) + `function.name`
- Pi SDK uses its own `ToolDefinition` type with `inputSchema`
- Tool call IDs, reasoning signatures, and metadata are provider-specific

A tool call made by Claude cannot be "replayed" to OpenAI without ID remapping and schema normalization.

### 4. Session Files Are Provider-Specific

On disk, each session has:
- `session.jsonl` — Rowl's canonical message log (display-level, not LLM-native)
- `.pi-sessions/` — Pi SDK's native session files
- `.claude.json` — Claude CLI's native session file
- `.codex-sessions/` — Codex CLI's native session files

Switching providers may leave orphaned provider-native files or require cleaning them up.

### 5. Auth Is Tied to Connection, Not Session

The `LlmConnection` object (in `llm-connections.ts`) holds:
- Provider type (`anthropic`, `pi`, `openai`, etc.)
- Auth credentials (API key, OAuth tokens, IAM creds)
- Base URL, custom endpoint, model list
- Provider-specific overrides

A session doesn't "own" credentials — it references a connection slug. Switching connections is easy; switching to a connection with a *different provider type* is the hard part.

---

## Open Questions (The Brainstorm)

### A. UX / Product Questions

1. **What does "switching" mean to the user?**
   - Switch the *next message* to a new provider (old history stays, new provider sees a summary)?
   - Replay the *entire conversation* through the new provider (full context migration)?
   - Fork the session at the switch point (new branch with new provider)?
   - All of the above, with a picker?

2. **What should the UI look like?**
   - A dropdown in the input bar that's always enabled (not locked after first message)?
   - A "Switch Provider" action in the session menu / command palette?
   - A banner/toast when rate-limiting is detected: "Switch to backup provider?"
   - Per-message provider badges in the chat history ("this message was Claude, next was GPT-5")?

3. **Should the user be warned about context loss?**
   - Some providers have different context windows — a 200k-token Claude conversation may not fit in a 32k-token cheap provider
   - Images may not be supported by the target provider
   - Tool results may not be replayable
   - How do we surface these risks without being annoying?

4. **What happens to the *current* turn?**
   - If the agent is actively streaming, can the user switch mid-stream?
   - If a tool is pending approval, does switching abort it?
   - If compaction is in progress, does switching wait or cancel?

5. **What about model switching *within* the same provider?**
   - This is already partially supported (`setSessionModel` exists)
   - Should we unify "model switch" and "provider switch" into one UX?

6. **How does pricing / usage tracking work?**
   - Token usage is currently aggregated per-session
   - Switching providers means token costs are in different currencies (Claude input tokens vs GPT-4 output tokens)
   - Do we need per-provider subtotals in the usage display?

7. **What about workspace defaults?**
   - If a session was created with Workspace A's default (Claude), and the user switches to OpenAI mid-session, then switches workspaces — what happens?
   - Should the session remember its "original" provider for workspace-switch logic?

### B. Technical / Architecture Questions

1. **Do we need a canonical conversation interchange format?**
   - Option 1: Use Rowl's `session.jsonl` as the single source of truth, and "rehydrate" the new provider's native session from it on switch
   - Option 2: Keep provider-native files and maintain a migration layer per (source, target) pair
   - Option 3: Don't migrate native state at all — treat the switch as a "new turn with full history replayed as a single prompt"
   - Option 4: Don't migrate — just start a *new* session with a system prompt that says "here's a summary of the previous conversation"

2. **How do we map message roles and content types?**
   - `user` → `user` (universal)
   - `assistant` → `assistant` (universal)
   - `tool` → varies: Anthropic has `tool_result`, OpenAI puts it in `function`/`tool` messages, Pi SDK has `ToolResultBlock`
   - `error` → not a native LLM role; we inject it as a system reminder or user context
   - `image` → Anthropic uses `source: { type: 'base64', ... }`, OpenAI uses `image_url`, Pi SDK uses `ImageContent`
   - What about `thinking` / `reasoning` blocks? Claude shows them; OpenAI doesn't have them; Pi SDK has its own format

3. **How do we handle tool call IDs?**
   - Each provider generates its own tool call IDs
   - A `tool_start` + `tool_result` pair from Claude cannot be directly replayed to OpenAI
   - Do we strip tool history and replace it with a text summary? ("The agent ran `Read file.py` and got `...`")
   - Or do we re-generate synthetic tool calls with new IDs?

4. **What happens to the agent's internal state?**
   - `PiAgent` has: `piSessionId`, `callbackPort`, `pendingToolExecutions`, `preToolMetadataByCallId`
   - `ClaudeAgent` has: `lastStderrOutput`, `pendingSteerMessage`, `claudeSessionId`
   - None of this is portable across providers
   - Is it acceptable to "destroy and recreate" the agent, losing all pending state?

5. **How do we handle the switch atomically?**
   - `SessionManager.setSessionConnection()` currently throws if `connectionLocked`
   - We'd need a new `switchProvider()` method that:
     1. Stops any active processing
     2. Destroys the current agent
     3. Creates a new agent with the new connection
     4. Rehydrates conversation history
     5. Updates `managed.llmConnection` and `managed.connectionLocked` (or removes the lock concept)
   - What if step 3 fails? Do we roll back to the old agent?

6. **Do we keep the old provider's session files?**
   - If the user switches Claude → OpenAI → Claude, can they resume the original Claude session?
   - Or does each switch create a *new* native session, orphaning the old one?
   - This affects disk usage and the "session resume on app restart" feature

7. **How does branching work?**
   - `PiAgent` supports SDK-level branching (`branchFromSdkSessionId`)
   - Claude/Codex don't have equivalent branching
   - If a session was branched from a Pi session, switching to Claude loses branch metadata
   - Should we block switching on branched sessions?

8. **What about custom endpoints?**
   - A user might have a `pi` connection with `customEndpoint: { api: 'anthropic-messages' }`
   - Switching from this to a native Anthropic connection *should* be seamless (same API shape)
   - But switching from `anthropic-messages` to `openai-completions` is a completely different protocol
   - Do we classify connections by "API family" (Anthropic-compat, OpenAI-compat, Google-compat) and only allow switches within families?

### C. Data / Persistence Questions

1. **What gets persisted to disk during a switch?**
   - The `session.jsonl` already records all messages — that's fine
   - But provider-native files (`.pi-sessions/`, `.claude.json`) may be orphaned
   - Should we clean them up? Or keep them for "resume on switch back"?

2. **How does session resume on app restart work after a switch?**
   - Today: SessionManager reads `session.jsonl`, sees `llmConnection`, recreates the agent
   - After switch: The session has messages from Provider A but `llmConnection` points to Provider B
   - On restart, we need to rehydrate Provider B's native session from the `session.jsonl` history
   - Is that always possible? What if the history contains provider-specific content (e.g., Claude thinking blocks) that Provider B can't consume?

3. **What about memory / long-term context?**
   - Rowl's memory system (Letta) stores conversation summaries
   - These summaries are provider-agnostic — that's fine
   - But the *session's* native history is what the LLM sees on the next turn
   - If we can't fully migrate native history, the LLM may see a truncated or summarized context

### D. Performance / Reliability Questions

1. **How long does a switch take?**
   - Destroying an agent + creating a new one + rehydrating history could take 1-5 seconds
   - During that time, the UI needs a loading state
   - What if the user sends a message during the switch?

2. **What if the new provider is unavailable?**
   - User switches to OpenRouter, but OpenRouter is down
   - Do we fall back to the original provider?
   - Do we show an error and leave the session in a "no provider" state?

3. **Rate limiting during switch?**
   - If Provider A rate-limits, the user switches to Provider B
   - But Provider B *also* rate-limits on the first message (because the rehydrated history is long)
   - Do we need a "switch and retry with backoff" loop?

### E. Security / Privacy Questions

1. **Credential isolation**
   - If a session was created with Connection A (Claude OAuth), and the user switches to Connection B (OpenAI API key), the session's messages (which may contain sensitive data) are now sent to OpenAI's servers
   - Should we warn the user about data sovereignty / cross-provider data flow?
   - Enterprise users may have compliance requirements (e.g., "this session must stay in AWS Bedrock")

2. **Session sharing / exporting**
   - If a session contains messages from multiple providers, what does the shared/exported transcript look like?
   - Do we include per-message provider metadata?
   - Does the receiver see "this was Claude, then GPT-4, then Gemini"?

---

## Proposed Approaches (Ranked by Complexity)

### Approach 1: "Hard Cut" (Minimal Viable)
**What:** Destroy the old agent, create a new one, and inject the conversation history as a single system-prompt summary. No native session migration.

**Pros:**
- Simple to implement — no canonical format needed
- Works across any provider pair
- No orphaned native session files

**Cons:**
- Loses tool call granularity (tools become text summaries)
- Loses images (or requires re-uploading them)
- Context window may be exceeded if the summary + history is too long
- The LLM loses "native" understanding of the conversation structure

**When to use:** As a v1 fallback when full migration isn't possible.

---

### Approach 2: "API-Family Migration" (Recommended)
**What:** Classify providers by their underlying API family (Anthropic-messages, OpenAI-completions, Google-generative-ai, Pi-native). Only allow switches within the same family. Migrate native session state using a per-family converter.

**Pros:**
- Preserves full conversation fidelity within families
- Images, tools, and reasoning blocks map 1:1
- Native session files can be recreated
- Resumption on restart works

**Cons:**
- Doesn't solve cross-family switches (Anthropic → OpenAI)
- Requires maintaining N converter modules
- Pi-native is its own family and can't switch to anyone else

**When to use:** As the primary approach, with Approach 1 as a fallback for cross-family switches.

---

### Approach 3: "Canonical Format + Rehydration"
**What:** Define a canonical conversation format (inspired by OpenAI's messages but extended). On every message, serialize to this format. On switch, deserialize and rehydrate the new provider's native session.

**Pros:**
- Universal — works across any provider pair
- Clean separation of concerns
- Enables future features (conversation export, import from other apps)

**Cons:**
- Huge engineering effort — need converters for every provider
- Lossy conversion for provider-specific features (Claude thinking blocks, Pi reasoning, etc.)
- Maintenance burden — every new provider needs a converter

**When to use:** Long-term architectural goal, not a v1.

---

### Approach 4: "Session Fork"
**What:** Instead of switching the *same* session, create a new session that copies the conversation history, and let the old session exist in read-only form. The user is now in a new session with a new provider.

**Pros:**
- Zero migration complexity — new session, new agent, clean slate
- Old session is preserved for reference
- Aligns with existing "branch" concept

**Cons:**
- Clutters the session list
- User loses the "single thread" mental model
- Memory (Letta) is per-session — the new session starts with empty memory

**When to use:** As an alternative UX, not a replacement for in-place switching.

---

## Decision Matrix

| Approach | Effort | Fidelity | Universality | UX Clarity | Maintainability |
|----------|--------|----------|--------------|------------|-----------------|
| 1. Hard Cut | Low | Low | High | Medium | High |
| 2. API-Family | Medium | High | Medium | High | Medium |
| 3. Canonical | High | Medium | High | High | Low |
| 4. Fork | Low | N/A | N/A | Low | High |

**My recommendation:** Start with Approach 2 (API-Family Migration) for same-family switches, and fall back to Approach 1 (Hard Cut) for cross-family switches. Approach 4 (Fork) can be offered as a menu option for users who want to preserve the original session.

---

## Next Steps

1. **Product decision:** Which approach(es) do we want to support? What's the v1 scope?
2. **UX design:** How does the switch UI work? Warnings? Loading states?
3. **Technical spike:** Can we build a proof-of-concept for Approach 2 (Anthropic → Anthropic-compat, e.g., Claude → OpenRouter with Anthropic shape)?
4. **Define API families:** Map all current providers to their API families
5. **Estimate effort:** How many sprints for v1?

---

## Related Code References

- `packages/server-core/src/sessions/SessionManager.ts:3783` — `setSessionConnection()` (the lock)
- `packages/server-core/src/sessions/SessionManager.ts:2574` — `connectionLocked = true` on first message
- `packages/shared/src/agent/pi-agent.ts` — PiAgent implementation
- `packages/shared/src/agent/claude-agent.ts` — ClaudeAgent implementation
- `packages/core/src/types/message.ts` — Rowl message types (display-level)
- `packages/shared/src/config/llm-connections.ts` — Connection configuration
