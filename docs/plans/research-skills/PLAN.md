# Sub-project: Research Skills — Implementation Plan

> **Goal:** Port Feynman's research-agent patterns into Rowl as first-class skills + tools, producing structured research docs that live in the project graph.
> **Duration:** 2 weeks (10 working days)
> **Depends on:** Sub-project #2 UI chrome (workspace rail, breadcrumbs) — done. Sub-project #2 Paperclip data model — NOT required; research docs are standalone files.
> **Branch:** `phase-a/research-skills`

---

## Architecture Decision (locked)

Research outputs are **plain markdown files** in `{workspaceRoot}/research/`, not memory blocks. Memory blocks (`persona.md`, `human.md`, `project.md`) are always-on context injected into every turn. Research docs are large, retrieved on-demand via tools.

Each research doc:
- Lives at `research/<slug>.md`
- Has YAML frontmatter: `title`, `topic`, `date`, `sources[]`
- Has a `.provenance.md` sidecar with raw citations
- Is discoverable via `list_research_docs`
- Is readable via `read_research_doc`

**Why files, not a database:** Same reasoning as memory blocks. `git clone` brings all research with the project. No lock-in.

---

## Week 1 — Core Tools + Skill (Days 1–5)

### Day 1 — Tool scaffolding

**Files to create:**
- `packages/session-tools-core/src/handlers/write-research-doc.ts`
- `packages/session-tools-core/src/handlers/read-research-doc.ts`
- `packages/session-tools-core/src/handlers/list-research-docs.ts`

**Files to modify:**
- `packages/session-tools-core/src/tool-defs.ts` — add 3 tool schemas + registry entries
- `packages/session-tools-core/src/handlers/index.ts` — export handlers

**Tool schemas:**

```ts
// write_research_doc
{
  slug: z.string().describe('URL-friendly identifier (e.g. "scaling-laws-2026")'),
  title: z.string(),
  topic: z.string().describe('The research question or topic'),
  content: z.string().describe('Full markdown body of the research doc'),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().optional(),
    dateAccessed: z.string().optional(),
  })).optional(),
}

// read_research_doc
{
  slug: z.string().describe('Slug of the research doc to read'),
}

// list_research_docs
{} // no args — lists all research docs in workspace
```

**Handler behavior:**
- `write_research_doc`: Write `{workspaceRoot}/research/<slug>.md` with YAML frontmatter + content. Also write `{workspaceRoot}/research/<slug>.provenance.md` with sources. Create `research/` dir if missing. Atomic write (temp + rename).
- `read_research_doc`: Read and parse frontmatter. Return both content and metadata.
- `list_research_docs`: Glob `research/*.md` (excluding `.provenance.md`), parse frontmatter of each, return array of `{slug, title, topic, date}`.

**Working directory resolution:** Same pattern as memory tools — `ctx.workingDirectory ?? resolveSessionWorkingDirectory(...) ?? resolveSessionWorkspaceRoot(...)`.

### Day 2 — Tool implementation + tests

Write handler implementations. Follow memory-tool patterns:
- Atomic writes (`writeFileSync` to temp, then `renameSync`)
- `gray-matter` for frontmatter parsing (pass `{}` options to disable cache — see locked decision in STATE.md)
- Graceful handling of missing files / malformed frontmatter

**Tests:**
- `packages/session-tools-core/src/handlers/__tests__/research-tools.integration.test.ts`
  - Write doc → verify file on disk with correct frontmatter
  - Read doc → verify round-trip
  - List docs → verify filtering excludes provenance files
  - Malformed frontmatter → returns error, doesn't crash

### Day 3 — Research skill (SKILL.md)

**File to create:**
- `skills/research/SKILL.md`

**Skill content:**
- YAML frontmatter: `name: "Research"`, `description: "Conduct structured research and produce cited briefs"`, `icon: "🔬"`
- Markdown body defines the research workflow:
  1. **Clarify the question** — Break broad topics into specific, answerable sub-questions
  2. **Gather evidence** — Use web search, browser tool, and file reading. Record sources.
  3. **Synthesize** — Use `write_research_doc` to produce a structured brief with findings, disagreements, open questions
  4. **Self-critique** — Before finalizing, list 3 weaknesses in the research and what would strengthen it
  5. **Cite** — Every claim links to a source. No claim without a citation.

Include explicit triggers: "research", "investigate", "what do we know about", "compare", "literature review".

### Day 4 — System prompt integration

**File to modify:**
- `packages/shared/src/prompts/system.ts`

Add a "Research Tools" section after "Memory Blocks" that:
- Describes `write_research_doc`, `read_research_doc`, `list_research_docs`
- Explains the research directory structure
- Gives triggers: "research X", "what do we know about Y", "compare Z"
- Guardrail: "Always use write_research_doc for research output. Never claim to have researched without producing a doc."

### Day 5 — Integration smoke test

End-to-end test:
1. Create workspace at fresh path
2. Start session, ask "Research the top 3 competitors to Notion and write a brief"
3. Verify agent calls `write_research_doc`
4. Verify file appears at `research/notion-competitors.md` with YAML frontmatter
5. Verify agent can read it back with `read_research_doc`
6. Verify `list_research_docs` shows it in the list

**Acceptance:** File exists, frontmatter is valid, content is structured, sources are cited.

---

## Week 2 — Multi-pass Research + UI Panel (Days 6–10)

### Day 6 — Multi-pass skill enhancement

Enhance `skills/research/SKILL.md` with Feynman's 4-pass pattern:

1. **Pass 1: Gather** — Use web search + browser to collect evidence. Write raw notes to a temp scratch file (not the final doc).
2. **Pass 2: Critique** — Review gathered evidence. What's missing? What's biased? What contradicts? List gaps.
3. **Pass 3: Synthesize** — Write the final research doc using `write_research_doc`. Structure: summary, key findings, disagreements/controversies, open questions, sources.
4. **Pass 4: Verify** — Check that every claim has a citation. Check that sources are reachable. Flag any dead links.

Update system prompt to reference the 4-pass pattern.

### Day 7 — Research docs UI panel

**Files to create:**
- `apps/electron/src/renderer/components/app-shell/ResearchDocsPanel.tsx`

**Files to modify:**
- `apps/electron/src/renderer/components/app-shell/PanelSlot.tsx` — register research docs panel
- `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx` — add panel type

**Panel design:**
- List of research docs for the current workspace
- Each item: title, topic (truncated), date, source count
- Click opens doc in a simple markdown viewer (or scrollable pre)
- Empty state: "No research docs yet. Ask the agent to research a topic."
- Refresh button

Reuse existing panel infrastructure (same pattern as SkillsListPanel, SourcesListPanel).

### Day 8 — IPC + backend for panel data

**Files to modify:**
- `packages/shared/src/protocol/channels.ts` — add `research:LIST_DOCS`, `research:READ_DOC`
- `packages/server-core/src/handlers/rpc/system.ts` — add handlers (reuse tool implementations)
- `apps/electron/src/shared/types.ts` — add IPC method signatures
- `apps/electron/src/transport/channel-map.ts` — wire IPC

**Why duplicate handlers?** The tool handlers are for the agent. The IPC handlers are for the UI. They share the same file-reading logic but have different consumers.

### Day 9 — Panel polish + keyboard shortcuts

- Add `Cmd+Shift+R` (or `Ctrl+Shift+R`) to open Research Docs panel
- Add delete action (with confirm) to remove research docs
- Add "Open in Finder" action
- Responsive layout for narrow panels

### Day 10 — End-to-end smoke + docs

**Smoke test matrix:**
1. Agent researches topic → doc appears in panel
2. Click doc in panel → viewer shows content
3. Delete doc in panel → file removed from disk, list updates
4. Restart app → panel still shows docs (persistence via filesystem)
5. Multi-workspace → each workspace sees only its own research docs

**Docs to update:**
- `docs/plans/research-skills/PLAN.md` — mark checkboxes, document any deviations
- `docs/STATE.md` — add sub-project entry if this becomes a formal initiative
- `docs/ROADMAP.md` — update Phase A status

**Branch merge criteria:**
- All 3 research tools have integration tests
- Panel renders without errors
- Smoke test passes
- `bun run typecheck` (shared) is green

---

## File Map

**Create (11):**
| Path | Purpose |
|---|---|
| `skills/research/SKILL.md` | Research skill definition |
| `skills/research/icon.svg` | Panel icon |
| `packages/session-tools-core/src/handlers/write-research-doc.ts` | Agent tool: write research doc |
| `packages/session-tools-core/src/handlers/read-research-doc.ts` | Agent tool: read research doc |
| `packages/session-tools-core/src/handlers/list-research-docs.ts` | Agent tool: list research docs |
| `packages/session-tools-core/src/handlers/__tests__/research-tools.integration.test.ts` | Integration tests |
| `apps/electron/src/renderer/components/app-shell/ResearchDocsPanel.tsx` | UI panel |
| `docs/plans/research-skills/PLAN.md` | This plan |
| `docs/plans/research-skills/SPEC.md` | Detailed spec (Day 1–2 output) |

**Modify (7):**
| Path | What changes |
|---|---|
| `packages/session-tools-core/src/tool-defs.ts` | Add 3 tool schemas + registry entries |
| `packages/session-tools-core/src/handlers/index.ts` | Export new handlers |
| `packages/shared/src/prompts/system.ts` | Add Research Tools section |
| `packages/shared/src/protocol/channels.ts` | Add research IPC channels |
| `packages/server-core/src/handlers/rpc/system.ts` | Add research IPC handlers |
| `apps/electron/src/shared/types.ts` | Add IPC signatures |
| `apps/electron/src/transport/channel-map.ts` | Wire IPC |

---

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Research docs get too large for context windows | Soft 50KB warn threshold in `write_research_doc`. Agent can split into multiple docs. |
| Agent doesn't use research tools without strong prompting | System prompt section + explicit triggers in skill + tool description guardrails |
| Panel UI feels disconnected from chat | Future: add "Reference in chat" button that pastes a doc link into the input |
| Working directory resolution is ambiguous | Reuse exact same logic as memory tools (tested, known-good) |

---

## Locked Decisions

- **Research docs are files, not DB rows.** Plain markdown + YAML frontmatter.
- **Provenance is a sidecar file**, not inline. Keeps the main doc readable.
- **No always-on injection.** Research docs are retrieved via tools, not memory blocks.
- **Slugs are kebab-case, ≤5 words.** Same convention as Feynman.
- **Atomic writes.** Temp file + rename, same as memory tools.
