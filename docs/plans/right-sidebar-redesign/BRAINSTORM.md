# Right Sidebar Redesign — Brainstorm

**Status:** 🟡 Brainstorm in progress — no spec, no plan, no code yet.
**Started:** 2026-04-20
**Sub-project:** #2 Organizing layer, feature #3
**Roadmap row:** `docs/ROADMAP.md:82`
**This doc is a living working document.** Both human and agent edit it freely. When the brainstorm settles, it graduates into `SPEC.md` and this file becomes a historical artifact.

---

## Purpose

Scope a from-scratch redesign of Rowl's right-side surface. Today, rowl-v2 has almost nothing on the right — just a `SessionInfoPopover` that opens on demand and shows `SessionFilesSection`. Meanwhile, the PRODUCT identity (memory-first + organizing layer + control-room dashboard) demands a first-class persistent right-side surface. This brainstorm figures out what that surface IS.

---

## Research findings (2026-04-20)

### From rowl-v2 docs (current repo)

**`docs/STATE.md`** — Rowl-v2 is a deliberate synthesis of four OSS projects:
- craft-agents-oss (base UI)
- letta-code (memory — sub-project #1 SHIPPED)
- paperclip (organizing layer — sub-project #2 IN PROGRESS)
- t3code (niche engineering features — sub-project #3 not started)

**`docs/ROADMAP.md:82`** — the one-liner scoping this feature:
> *"Right sidebar redesign — glass detached overlay, workspace settings UI, memory UI (surfaces #1's memory blocks in-app without Palace-level complexity)."*

**Current state of the right side:** nothing persistent. Only the `SessionInfoPopover` popover triggered from a button, hosting `SessionFilesSection` (files the agent touched this session).

**Workspace settings** — user confirmed these already exist elsewhere in the app, so they are OUT of scope for this project.

### From original Rowl docs (`/Users/mauriello/Dev/rowl/`)

**`docs/ROWL_VISION.md`** — the pre-pivot vision document. Key framings:

- Rowl is an **"Agentic Engineering Control Room"**, not a chat app.
- Metaphor: recording studio / airline dashboard — multiple tracks, visible instruments, mixers.
- **Dashboard Principle:** *"You can see what each agent is currently working on, how much context each agent is using, what tools each agent has called, what the agent is 'thinking' (when reasoning is enabled), how far along each task is, what approvals are pending."*
- Vibe coding philosophy: *humans are notice-ers, not coders. Context is everything. The "why" matters more than the "how."*
- V1.1 addendum: memory is **"the missing piece"** — a persistent substrate. Not the whole product, but the layer that was absent.

**`docs/ROWL_ROADMAP_V2.md`** — the pre-pivot roadmap. Original Rowl shipped a **5-tab right sidebar (Tier 1 complete)**:
1. **PM Chat** — real AI conversation, project-aware system prompt
2. **Threads** — project thread list with status indicators
3. **Goals** — full CRUD with main goal designation, inline editing, thread linking
4. **Features** — kanban board (Backlog / In Progress / Done / Wishlist)
5. **Context** — context-node visualization, budget gauge, compress/restore/delete

Plus responsive modes: inline (>1280px), overlay (1024–1279px), collapsed (<1024px).

Additional control-room items in the original roadmap:
- **Overseer / Guardian** — pattern-matching background watcher that flags issues
- **Apply / Review System** — structured queue for approve/reject/rollback
- **Visual Project Dashboard** — live agent status indicators
- **Codebase Intelligence** — runtime queryable model of project codebases

### Implication

The original Rowl's right sidebar **was the project-management / control-room layer**. It's where the non-coder drove the whole thing. That sidebar is *gone* in rowl-v2 because we forked craft-agents instead of t3code. Sub-projects #1–#3 are the staged reconstitution of that control room, now built on the memory-first substrate.

**So the right sidebar in rowl-v2 is not a cosmetic improvement to craft-agents' chrome.** It is the reassembly of the product's identity — the place where the human watches and steers the agent.

---

## Organizing principle: control-room dashboard

The sidebar is the **agent-observability + control surface**. Vertical axis = layers of what the human can see and steer, from longest-lived/most-persistent at top to most-ephemeral at bottom:

```
┌──────────────────────────────────────┐
│ ▸ Memory (persistent understanding)  │  sub-project #1 ✅ shipped substrate
├──────────────────────────────────────┤
│ ▸ Goal / Issue (what we're doing)    │  sub-project #2 feature #4 — not started
├──────────────────────────────────────┤
│ ▸ Context (what's in the turn NOW)   │  t3code cherry-pick — sub-project #3
├──────────────────────────────────────┤
│ ▸ Session activity (files, tools)    │  existing SessionFilesSection
├──────────────────────────────────────┤
│ ▸ Attention (right-now)              │  Overseer + Review — sub-project #3/later
└──────────────────────────────────────┘
```

### How each section reinforces a Rowl main goal

| Section | Main goal it embodies | What a non-coder user "gets" from it |
|---|---|---|
| Memory | Memory-first identity (sub-project #1) | "The agent knows me. I can see what it knows. I can correct it." |
| Goal / Issue | Organizing-layer identity (Paperclip, sub-project #2) | "This work belongs to something bigger. I can see why we're doing it." |
| Context | Context-is-everything principle (Vision §Core) | "I can see what the agent has in its head right now. Nothing is hidden." |
| Session activity | Dashboard principle (Vision §Visibility) | "I can see what the agent just did — files, tools." |
| Attention | Notice-er / safety-net (Vision §Vibe Coding + Non-coder safety net) | "Rowl will tell me when I need to step in. I don't have to babysit." |

### Why this framing over alternatives

- **Anchored in product identity.** Sidebar instantly reads as "control room" rather than "generic file inspector."
- **Solves the workspace-vs-session scope problem.** Each layer declares its own scope; they can't feel "mixed."
- **Every future tenant has a home.** When Paperclip lands → Goal/Issue populates. When context meter lands → Context populates. When Overseer lands → Attention populates. No retrofit.
- **The emptiness is diegetic.** Empty layers aren't "missing features" — they're visible scaffolding that previews the product's roadmap to the user.

### Alternatives considered

- **Tabs (PM/Threads/Goals/Features/Context like original Rowl)** — Rejected for V1: too much surface area to design at once; tabs hide 4/5 of the information at any moment which fights the dashboard principle.
- **Single-tenant memory-only sidebar** — Rejected: squanders the prime real estate and doesn't honor the control-room identity.
- **Persistence-axis framing (information-theoretic)** — Structurally identical to control-room framing, but weaker anchor: less tied to product identity, more abstract.

---

## Section-by-section behavior (detailed)

Each section is a `<SidebarSection>` card with: title, icon, expand/collapse chevron, optional right-side header action slot, body. Uniform API so new sections can be added without retrofitting chrome.

### 1. Memory — V1 ships full UI

**Purpose:** The first UI that surfaces sub-project #1's memory blocks. Previously only accessible by editing .md files externally.

**Data source:** `@craft-agent/shared/memory/loadMemoryBlocks` — reads `{workspaceRoot}/memory/*.md` each time. Blocks have `label`, `description` (frontmatter), `body` (markdown), `limit?` (soft cap), plus we read `.history.jsonl` for change log.

**Scope:** Workspace. Identical content across every session in the workspace.

**Layout (per block):**
- **Card head:** `[icon] label` · description (muted, one line, truncated) · size indicator (`2.1 KB / 4 KB limit` if `limit` is set, else just `2.1 KB`) · "Updated 2h ago (agent)" timestamp.
- **Card body (collapsed by default):** Click card head → expand → markdown body rendered read-only with syntax highlight. A small `Edit` button top-right of the expanded body.
- **Edit flow (V1 simple):** clicking Edit swaps the rendered markdown for a plain textarea with save/cancel. Save writes via the existing `writeBlockAtomic` path through an IPC handler (new — doesn't exist yet on the renderer side; server-side `core_memory_replace/append` machinery already works). Save updates mtime; a success toast shows.
- **Alternative edit flow (V1 escape hatch):** `Open in external editor` button reveals the .md file in Finder or opens in system default. Useful when the user wants to do a big rewrite. No watcher needed — the existing live-per-turn re-read from disk means external edits land on the next turn anyway. The sidebar needs a refresh button (or auto-reload on window-refocus) to pick up external edits in the UI.

**Section head extras:**
- Size summary: "3 blocks · 5.4 KB" in muted text beside the chevron.
- `+ New block` button: opens a mini-form (label, description). Creates the file via `writeBlockAtomic` with empty body.
- `Show history` toggle: reveals a compact log of recent `.history.jsonl` entries beneath the blocks. Each entry = "2h ago · agent · appended to human.md (+120 bytes)". Not intrusive. Useful for auditing the agent's memory edits.

**Empty state:** Shouldn't occur in normal flow — memory blocks are lazy-init'd to persona/human/project on first session. If it does (manual deletion), show "No memory yet. [Create defaults]" button that calls `ensureDefaultMemoryBlocks`.

**What this CREATES for the user:**
- A concrete answer to "what does the agent know about me?" — visible, always there.
- An obvious place to correct an incorrect belief the agent formed.
- Agent memory writes become reviewable (via `Show history`), not invisible.
- Teaches the vocabulary: "memory blocks," "persona," "project context."

### 2. Goal / Issue — V1 uses a simplified proxy; full feature lands with sub-project #2 feature #4

**Purpose:** Answer "what is this session/workspace actually trying to accomplish?" That question is load-bearing for the Paperclip layer (sub-project #2 feature #4). We can't ship the full data model in V1, but we can ship a useful stand-in that graduates cleanly.

**V1 proxy — "Session intent":**
- A single editable text field inside the section.
- Content: one paragraph of free text. "I'm trying to ship the right-sidebar redesign" or "debugging the blank-session bug."
- Stored per-session in session metadata (new field, `sessionIntent?: string` on `Session`). Small schema add; compatible with existing session JSONL.
- Auto-saved on blur. No validation.
- The field's VALUE gets injected into the agent's per-turn context under a tag like `<session_intent>...</session_intent>`, right after `<memory_blocks>` in `PromptBuilder.buildContextParts()`. Parallels the memory-block injection pattern.
- A "Clear" button resets it to empty.

**Why this is worth shipping in V1 (not just an empty card):**
- Gives immediate real value — agent knows why THIS conversation exists.
- Teaches the product vocabulary before Paperclip lands ("Goal / Issue is about WHY").
- When Paperclip lands, this field migrates cleanly: session intent becomes the Issue description if the user hasn't linked a real Issue.

**Future (sub-project #2 feature #4) — post-V1:**
- Workspace has a tree of Goals.
- Each Goal has sub-Issues.
- Sessions link to a specific Issue.
- This section then shows: current Goal title + ancestry crumb · current Issue title · "Other sessions linked to this Issue" mini list.
- The free-text "session intent" becomes the Issue description, editable inline.

**Empty state (V1):** Text field shows a muted placeholder: "What's this session trying to accomplish?" No awkward empty card.

**Scope:** Session for V1 (per-session intent). Graduates to Issue-scoped (shared across sessions) when Paperclip lands.

### 3. Context — V1 ships a minimal "what's in the prompt right now" view; full feature with sub-project #3

**Purpose:** Make the invisible visible. Show what the agent is actually receiving, right now. This is Vision §Context-is-everything made literal. Also a trust-builder: "nothing is hidden."

**V1 minimal view:**
- A stacked list of "context parts" that will be injected on the next turn:
  - `Memory blocks (3) · 5.4 KB` — clickable, collapses into a preview of the block labels.
  - `System prompt · ~1.2 KB` — clickable shows the first 10 lines.
  - `Tools available (24)` — count. Click expands to list tool names.
  - `Session history · N turns · ~X tokens` (rough estimate: char-count / 4).
  - `Skills loaded (M)` — if any skills are in scope for this session.
  - `Attachments (K)` — if any.
- A rough **budget gauge** at the top of the section: `~Y / 200k tokens estimated`. Color: green / amber / red at thresholds. Explicitly marked as "estimate" to avoid false precision.
- Data comes from `PromptBuilder.buildContextParts()` plus session state. No new substrate needed — we introspect what the prompt builder already produces.

**Future (sub-project #3 cherry-pick from t3code) — post-V1:**
- Real token counts (not estimates).
- Tombstones: "[3 messages trimmed for context at 14:32]" with click-to-inspect.
- Compress/restore/delete individual context nodes.
- Budget with precision and cost projection.

**Why ship V1 minimal:** It's the single most powerful trust-builder in the whole sidebar. The user can literally see the memory blocks flowing into the prompt. That's the memory-first identity made tangible. Shipping "coming soon" here would squander the opportunity.

**Empty state:** Shouldn't occur — there's always SOME prompt context. If no session is active, the section is hidden.

**Scope:** Session.

### 4. Session activity — V1 ports existing `SessionFilesSection`; extends later

**Purpose:** The dashboard principle: "I can see what the agent just did." Answers "what files did it touch, what tools did it call."

**V1 ported content:**
- Files touched (from the existing `SessionFilesSection`).
- File icons + filename + dirname · right-align: read/write/edit badge.
- Click to open file in the configured editor.
- Group by recency (most recent first).

**V1 small addition:**
- Above the file list: a compact "Tools used this session" pill row: `Read 14 · Write 3 · Bash 2 · MCP 5`. Counts pulled from session event log. Click a pill to filter the files list. This makes the content of the chat transcript quickly scannable without scrolling.

**Future:**
- Per-turn checkpoint diff badges (requires t3code checkpoints).
- Tool-call timeline view.
- Attachments sub-card.

**Empty state:** "No activity yet. Send a message to get started."

**Scope:** Session. Resets on session switch.

### 5. Attention — V1 HIDDEN until content exists

**Purpose:** Notice-er / safety-net. "Tell me when I need to step in." Must not cry wolf.

**V1 hidden behavior:**
- Section is entirely hidden when there's nothing to show. Not a collapsed card; not visible at all.
- Only three V1 triggers:
  1. **Permission prompt pending** (already modeled by `pendingPermission` — today rendered inline in the chat; sidebar would show a compact mirror with a jump-to-chat button).
  2. **Credential prompt pending** (same: `pendingCredential`).
  3. **Memory block warning:** empty `persona.md` or `human.md`. "Agent has no persona defined. Edit ↗" link jumps to that block in Section 1.

**Future (sub-project #3/Overseer, later):**
- Overseer alerts: "Agent has been writing for 8 minutes without a tool call."
- Approval queue items.
- Model errors / transport errors surfaced here instead of as toasts.

**Why ship something in V1:** Without the Memory warning trigger, Section 5 is dead weight. The Memory warning is a small trigger that earns the section's presence AND reinforces the memory-first identity.

**Empty state:** Literally not rendered.

**Scope:** Mixed. Permission/credential prompts are session-scoped; memory warnings are workspace-scoped.

---

## Chrome mechanics

### Aesthetic
- **Glass detached overlay.** Matches the workspace rail treatment already shipped. Translucent, elevated, inside corners rounded via `clip-path` (same technique as the shell corner fix in locked-decision 2026-04-20).
- **Not flush-docked.** The sidebar floats over the right edge with some window-edge padding — it doesn't push the chat content leftward. Chat always has its natural width.
- **Inside corners:** rounded at top-left and bottom-left where the sidebar meets the chat area.
- **Scroll:** Each section scrolls independently only when its body exceeds a fixed max-height. The outer sidebar scrolls vertically when the sum of sections exceeds window height.

### Size and resize
- **Default width:** 360px. Chosen to match Mac-native inspector conventions and to give memory-block body text a readable measure.
- **Resizable?** V1 decision: **fixed 360px.** Drag-to-resize adds complexity + persistence decisions. Revisit in V2.
- **Persist per-workspace:** open/closed + which sections are collapsed, stored in existing preferences JSON (`UserPreferences.rightSidebar: { open: boolean, collapsedSections: string[] }`).

### Toggle + placement
- **Toggle:** existing `rightSidebarButton` in `PanelHeader` keeps its role. Click = show/hide entire sidebar. Hidden = `display: none`, not just transform off-screen (saves render cost).
- **Keyboard:** `Cmd+Shift+.` (period) to toggle. Picked because `Cmd+Shift+I` is devtools, `Cmd+Shift+R` is reload, and `.` is visually the "dot" on the right edge.
- **Default on first launch:** open.

### Responsive
- **Wide (>1280px):** sidebar is a fixed column on the right.
- **Narrow (≤1280px):** sidebar becomes an overlay — same visual, but positioned absolute over the chat instead of pushing layout. Closes when user clicks outside or presses Esc.
- **Very narrow (<900px):** toggle button hides the sidebar completely; show via button only. Section 5 Attention items could promote to a topbar badge — defer to V2.

### Persistence model
- Sidebar state (open/closed + section collapses) stored in `UserPreferences` (existing JSON on disk, same file as workspace rail order).
- Session intent (Section 2 V1 proxy) stored per-session in session JSONL metadata.
- Memory blocks already persist to disk — no new substrate.

### Live updates
- **Memory section:** re-read from disk on window focus, on `core_memory_replace/append` events (new event the backend emits post-write), and on manual refresh button. NO watcher daemon in V1 — disk-read cost is negligible.
- **Session activity:** subscribes to the existing session tool-call event stream.
- **Context section:** re-computes on every turn boundary.
- **Attention:** subscribes to `pendingPermission`/`pendingCredential` atoms + memory-block-warning derived atom.

### Interaction with the blank-session reconnect bug
- The sidebar is SEPARATE from the chat-body reconnect flash. It MUST NOT go blank during stale reconnects. Memory is workspace-scoped and doesn't depend on session rehydration. Session activity already tracks its own state; if it flashes, that's the spawned-task fix's concern, not the sidebar's.

---

## V1 scope (refined)

### In scope
1. Glass-detached chrome with vertical collapsible sections; `<SidebarSection>` component API.
2. Memory section — full read + inline edit + history log + new block.
3. Goal/Issue section as "Session intent" text field + backend context-injection parallel to memory blocks.
4. Context section — minimal "what's in the prompt" view with rough token estimate.
5. Session activity section — ported from popover + tool-count pill row.
6. Attention section — hidden by default; triggers for pending permissions/credentials + empty-persona/human warning.
7. Toggle button + `Cmd+Shift+.` keyboard shortcut.
8. Width fixed 360px; open/closed + collapse state persisted per workspace.
9. Responsive break at ≤1280px (overlay mode); hide-on-very-narrow.
10. Popover retired (or kept only as fallback in the <900px case — TBD).

### Out of scope (V1)
- Workspace settings (already exists elsewhere).
- Paperclip full data model (Goal/Issue uses text-field proxy).
- Real context metering / tombstones (Context uses estimates).
- Overseer alerts, approval queue, checkpoints.
- Drag-to-resize sidebar width.
- Drag-to-reorder sections.
- Palace-level diff viewer or history browser for memory.
- Multi-window sidebar state sync.
- Theme-specific glass adjustments beyond matching current shell.

---

## Open questions

- [ ] **Q1 — Control-room framing confirmation.** A = yes / B = plus context scaffolded / C = memory-only / D = reframe entirely. _(Leaning A.)_
- [ ] **Q2 — Memory editing UX.** V1 inline textarea + external-editor escape hatch? Or modal-only? _(Leaning inline + escape hatch.)_
- [ ] **Q3 — Default section expansion on first open.** All expanded? Memory+Session only? Session only? _(Leaning: Memory + Session activity expanded by default, others collapsed.)_
- [ ] **Q4 — Should Context section ship a real estimate in V1, or show "coming with sub-project #3"?** _(Leaning: ship the minimal estimate view — highest identity payoff per effort.)_
- [ ] **Q5 — Session-intent field: ship in V1 or defer to Paperclip?** _(Leaning: ship in V1 — gives Section 2 real content and teaches vocabulary.)_
- [ ] **Q6 — Sidebar width: fixed 360px or user-resizable?** _(Leaning: fixed for V1.)_
- [ ] **Q7 — SessionInfoPopover disposition: kill entirely, keep as <900px fallback, or keep as alternate UI?** _(Leaning: keep as <900px fallback so very-narrow windows still have SOMETHING.)_
- [ ] **Q8 — Cmd+Shift+. as the toggle or pick something else?** _(Mac-native convention check needed — Cmd+Option+0 is Xcode's inspector toggle.)_
- [ ] **Q9 — Memory history log: show by default in Section 1 head, or hidden behind a toggle?** _(Leaning: hidden, opt-in.)_
- [ ] **Q10 — Empty Attention section in V1: literally not rendered, or rendered as a skeleton line "Nothing needs your attention"?** _(Leaning: not rendered. Skeleton is noise.)_

---

## Decisions locked so far

_(None yet — everything in "V1 scope (refined)" is proposal, not lock.)_

---

## References

**In-repo:**
- `docs/STATE.md` — product north star + sub-project arc
- `docs/ROADMAP.md:82` — the one-line feature scope
- `apps/electron/src/renderer/components/app-shell/SessionInfoPopover.tsx` — current popover
- `apps/electron/src/renderer/components/right-sidebar/SessionFilesSection.tsx` — current files surface
- `packages/shared/src/memory/` — memory block substrate (shipped)
- `packages/shared/src/agent/core/prompt-builder.ts:66` — `buildContextParts()` — memory injection point; session-intent injection would parallel this
- `apps/electron/src/renderer/components/app-shell/PanelHeader.tsx` — existing `rightSidebarButton` slot

**External references (read-only):**
- `/Users/mauriello/Dev/rowl/docs/ROWL_VISION.md` — original pre-pivot vision
- `/Users/mauriello/Dev/rowl/docs/ROWL_ROADMAP_V2.md` — original 5-tab sidebar spec
- `/Users/mauriello/Dev/_reference/letta-code/` — Palace viewer reference (not porting directly)
- `/Users/mauriello/Dev/_reference/paperclip/` — organizing-layer data model (future input)
- `/Users/mauriello/Dev/_reference/t3code/` — context meter / checkpoints (future input)

---

## Edit log

- **2026-04-20** — Doc created. Research from rowl-v2 + original Rowl docs. Control-room framing proposed. 7 open questions. No decisions locked.
- **2026-04-20 (same day, revision)** — Expanded into section-by-section detail tied to each Rowl main goal. Added "How each section reinforces a Rowl main goal" table. Wrote concrete V1 behavior per section (Memory with inline edit + history log; Goal/Issue proxied by "session intent" text field that injects into prompt; Context with minimal "what's in prompt" view + rough budget gauge; Session activity with tool-count pills; Attention hidden but with 3 V1 triggers). Added Chrome mechanics (aesthetic, size, toggle, responsive, persistence, live updates). Refined V1 scope to 10 concrete items. Open questions grown to 10 (with leanings). Still no locked decisions.
