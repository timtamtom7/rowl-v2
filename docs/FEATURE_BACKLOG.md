# Rowl — Full Feature Backlog

**What this is:** every feature, idea, and system we've ever written about across both `rowl-v2` (this repo) and the pre-pivot `rowl/` repo, that is NOT currently shipped in `rowl-v2`. One big list in plain English.

**How to use it:** scan the categories, pick what matters to you, we can then brainstorm → spec → build. Nothing here is prioritized — it's a menu, not a plan.

**Status markers** (added after 2026-04-20 audit against rowl-v2 codebase):
- ✅ **SHIPPED** — actually works today, no rebuild needed
- 🟡 **PARTIAL** — some code/infra exists, gaps remain
- (unmarked) — fully missing, greenfield work

**Last updated:** 2026-04-20 (audit pass completed)

---

## Memory features (beyond what we've already shipped)

1. **Reminder engine** — The agent gets "poked" on a schedule to re-read / refresh its memory. Right now, memory only changes when the user or agent explicitly edits it.

2. **Palace UI** — A dedicated in-app screen for browsing every memory block, viewing their history, seeing diffs, and editing them. Today you have to open the .md files in an external editor.

3. **Archival memory** — A long-term, searchable store of older memory (think: the agent's "long-term memory" vs the always-on "short-term" blocks). Deferred — not building unless proven needed.

4. **Per-session scratch memory** — Short-lived memory blocks tied to a single session, separate from the persistent workspace blocks.

5. **Two-tier memory (global + project)** — A personal "about me" layer that follows you across every workspace (not just per-project). Today, memory is workspace-scoped only.

6. **Richer memory edit tools** — Today the agent has 2 tools (`replace`, `append`). Originally designed: 6 tools (`create`, `insert`, `delete`, `rename`, `update_description`, plus the two we have). More granular but more complex.

7. **Agent personality presets** — Pick a named preset (rowl-default, linus, kawaii, claude, codex) when creating an agent; it seeds the persona.md.

8. **Multiple agents per workspace** — Today one workspace = one implicit agent. The original plan has multiple named agents per workspace, each with their own memory, plus `/agents`, `/new`, `/rename`, `/pin` commands.

9. **`/init` command** — Agent scans the codebase and proposes initial memory blocks (overview, architecture, conventions, decisions, current-focus) for your approval. Makes new workspaces feel "pre-populated."

10. **`/doctor` command** — Agent reviews its own memory for redundancy, staleness, or gaps. Keeps memory from silently rotting.

11. **`/compact` command** — Takes a long conversation and summarizes key decisions into memory.

12. **`/reflect` command** — A background agent reads recent transcripts and refines memory blocks. "Sleep-time thinking."

13. **"AI used this memory" indicator** — Visual signal in the chat when a memory block was actually referenced on a given turn. Makes the invisible memory system tangible.

14. **Auto-extraction feedback** — A small chat-inline confirmation ("3 decisions saved from this conversation") when the agent writes to memory automatically.

---

## Organizing layer — Goals, Issues, Features (Paperclip)

15. **Right sidebar redesign** — The 5-section panel we were just brainstorming. Still TBD.

16. **Goals / Issues / Documents data model** — The actual Paperclip entities. Goals have sub-goals, Issues live under goals, Documents/Feedback/Approvals live under issues. Sessions become children of Issues. Today, sessions are a flat pile.

17. **Goal ancestry and roll-up views** — Parent-child goal relationships with progress/status summed across children. Anti-scope-drift mechanism.

18. **Feedback / approval workflows on sessions** — Session output goes into a review queue for approve/reject with a full audit trail.

19. **Session → Issue linking** — Explicit "this session is working on Issue X" link, with a "other sessions on this Issue" list.

20. **Session intent field (V1 proxy)** — A per-session free-text "what am I trying to accomplish" field, injected into the agent's prompt each turn. Simple. Teaches the Paperclip vocabulary before the real data model lands.

21. **Project Brief editor** — Markdown editor for a human-authored project description file, injected into every turn. Distinct from memory (human-only, not agent-editable).

22. **Features Kanban board** — Drag-drop kanban (Backlog / In Progress / Done / Wishlist) for features, linked to threads. Existed in old Rowl; lost in the pivot.

23. **Feature ↔ thread linking** — Pick which feature a session is working on from the composer; feature cards show the active thread. Bidirectional.

24. **Goal progress tracking** — Calculated progress per goal based on how many linked features/issues are complete.

25. **Smart session titles** ✅ SHIPPED — Titles auto-derived from the linked feature/thread goal/first message. Lives in `packages/shared/src/utils/title-generator.ts`, called by `SessionManager.generateTitle()`.

---

## Control room / Dashboard

26. **Overseer / Guardian** — A background watcher that reads the AI's streaming output and flags failure modes non-coders can't detect: "I can't do that" when the AI actually can, loops, stuck tasks, delegation to the human, dangerous commands, premature "done." Produces non-jargon alerts. The non-coder's safety net.

27. **Overseer confidence levels** — CRITICAL alerts block progress, WARNING alerts are dismissible, INFO auto-dismisses. Keeps the safety net from crying wolf.

28. **Overseer learning loop** — Track what alerts you dismiss, improve the pattern bank over time.

29. **Custom Overseer patterns** — Let users add their own trigger patterns per project.

30. **PM Chat** — A dedicated AI "product manager" chat in the sidebar, project-aware (knows your brief, goals, features, active threads). Can create goals, spawn agents, coordinate work. The non-coder's primary driver.

31. **PM clarifying questions** — PM proactively asks structured questions before coding starts instead of diving in.

32. **Visual project dashboard** — Bird's-eye screen with every project as a card: live agent status, goal/feature progress, health score, thread counts, quick actions. Cross-project status bar up top.

33. **Agent process monitor** — Per-agent streaming panel showing current task, tokens, tool calls, reasoning trace, cost, with pause/resume/interrupt controls.

34. **Project timeline view** — Zoomable horizontal timeline of all events (messages, tool calls, approvals, checkpoints) for a project, color-coded by agent.

35. **Cross-project activity feed** — Real-time event stream across all your projects — "agent X finished turn; agent Y waiting for approval."

36. **Codebase Intelligence index** — Background worker maintaining a queryable model of the codebase (files, embeddings, dependencies) that PM reads from when planning — instead of scanning live code each time.

37. **Live Map / Nerve Map** — Force-directed graph of the project's files and dependencies, colored by health, with edges glowing when an agent touches a file.

38. **Map overlays** — Map colored by feature boundaries and goal connections, bridging the PM layer with the codebase.

39. **Codebase health dashboard** — File-level health over time, hot files, coupling analysis ("changing X will affect Y, Z"), unused-export detection. Non-coders see codebase decay they can't read.

---

## Context / Visibility

40. **Real context budget meter** — Precise token meter with per-category breakdown (system prompt / memory / history / attachments / tools) and cost projection. Warnings at 80% and 95%. Today: nothing.

41. **Tombstone trimming** — When context fills up, individual messages are trimmed and a visible marker is left ("3 messages removed at 14:32"). Click the marker to inspect what was removed or restore it.

42. **Real LLM-based context compression** — Actual AI-driven summarization that reduces tokens while preserving meaning. Today there's no compression.

43. **Selective context injection (`/inject`)** — Pull specific context from another thread, project, or external source into the current turn.

44. **"What the AI is seeing" summary** — Plain-English readout: "The agent received 1,200 tokens of project context, 400 tokens of memories, 3 memory blocks, 24 tools available…" Makes the invisible literally visible.

45. **Context ring visualization** — Radial chart replacing flat bars, animated, click a segment to see what's in it.

46. **Per-provider permission profiles** — Distinct allow/ask/deny policies per provider (e.g., Codex stricter than Copilot), with presets.

47. **Approval audit trails** — Searchable log of every permission approve/deny with reason, scope, and timestamp.

48. **Cross-thread context sharing UI** — See another thread's context and copy pieces into your current one.

49. **Context preservation on crash / restart** — When an agent crashes or restarts, its context is preserved intact instead of being re-derived.

---

## Niche engineering features (t3code)

50. **Turn-level checkpoints** 🟡 PARTIAL — Every agent turn snapshots the workspace via git. Scrub history like a timeline; "undo last turn" is a first-class button. Some git-commit infra implied in rowl-v2 but no UI for timeline / undo. Existed in old Rowl, lost in pivot.

51. **Per-session worktree isolation** 🟡 PARTIAL — Each session runs in its own git worktree so parallel sessions don't collide on branches. Only a code comment acknowledging the concept (`packages/shared/src/agent/claude-agent.ts:965`); no actual worktree creation.

52. **Stacked PRs** — Multi-branch stack management. One logical change reviewed across several dependent PRs.

53. **Composer draft persistence** ✅ SHIPPED — Half-typed prompts auto-save per session. Debounced sync in `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx:443,480,1334` with restore-on-mount. Survives reloads.

54. **Planner / Executor two-model architecture** — Split the agent into a planner (picks steps) and an executor (runs them), potentially different models.

55. **Plan mode** 🟡 PARTIAL — Agent produces a structured plan before touching code; user approves the plan, then execution runs. Full type system (`packages/shared/src/agent/plan-types.ts`) exists with Plan/PlanState/PlanStep/refinement flow, but `EnterPlanMode`/`ExitPlanMode` tools are actively disallowed in Claude agent and there's no UI. Finishing = build the UI + unblock the tools.

56. **Evaluator agent pattern** — After a "builder" claims done, a lightweight evaluator agent runs build/test/spec-compliance checks: "Builder says done. Evaluator says: build passes, 2 tests fail."

57. **Harness presets** — 5 built-in behavior presets (Careful Builder, Fast Prototyper, Systematic Debugger, Code Reviewer, Refactorer) selectable per thread. PM suggests appropriate ones.

58. **Custom user harnesses** — Fork a built-in harness, modify it, save as custom. PM can suggest creating new ones from recurring patterns.

59. **Project prompts / rules layer** — CRUD for per-project / per-thread / global rules ("always write tests first") injected into the system prompt.

60. **Spec-driven-dev enforcement** — Overseer pattern that warns if the agent starts coding before a spec is written or tests are in place.

61. **Memory-aware slash commands** — `/tombstones`, `/guardian`, `/inject`, `/palace`, `/memory`, `/remember`, `/init`, `/doctor`, `/compact`, `/reflect`, `/agents`, `/pin`.

---

## Multi-agent / Multi-provider orchestration

62. **Multiple simultaneous agents** — Two or more agent sessions running in parallel in a project, each in its own worktree.

63. **Task graph dependencies** — Agents wait for each other. "Agent A researches → B implements → C tests → D reviews."

64. **Agent process isolation + auto-restart** — Each agent in an isolated subprocess. One crash doesn't take down the others. Auto-restart with state restoration.

65. **Inter-agent communication** — Shared inbox/outbox, shared context regions, read-only cross-agent permissions.

66. **Multi-provider context preservation** — When a task spans Claude + Codex, context is translated between them, not restarted from zero.

67. **Provider output comparison** — Same prompt, multiple providers, side-by-side results.

68. **Intelligent task routing** — Auto-route each task to the best provider for it.

69. **Non-technical error surfaces** — "The AI connection got interrupted — retrying" instead of stack traces. Every provider-failure has a non-coder-readable explanation.

70. **Per-agent resource monitoring** — Cost, tokens, CPU/memory per agent in the dashboard.

---

## Multi-medium / Creative

71. **Agent type abstraction** — Refactor so "agent" ≠ "coding agent." Agents declare capabilities (can_code, can_generate_images, can_generate_video, can_write_documents). Prerequisite for everything below.

72. **Flora integration (images)** — AI image generation as a first-class agent type, images in the approval queue, images linked to code projects.

73. **Flashboards integration (video + canvas)** — AI video generation and a drag-drop visual canvas project type.

74. **Cross-medium context flow** — Image mockup becomes coding-agent input; code change re-triggers design review.

75. **Document / knowledge-work as first-class** — Technical docs, RFCs, ADRs co-authored by agents, reviewed in the same queue as code.

---

## UX / Chrome

76. **Memory section UI** — First-class UI for memory blocks: expand-to-read, inline edit, "open in Finder" escape hatch, new-block form, compact history log, size indicator. (The brainstormed V1 flagship feature.)

77. **Attention section** — Bottom sidebar section that only renders when something needs attention: pending prompts, empty-persona warnings, future Overseer alerts.

78. **`<SidebarSection>` component API** — Uniform section primitive (icon + title + chevron + body) so new sections slot in without chrome retrofits.

79. **Responsive sidebar modes** — Wide (>1280px) = fixed column. Narrow (≤1280px) = overlay over chat. Very narrow (<900px) = hidden, toggle-only.

80. **`Cmd+Shift+.` sidebar toggle** — Keyboard shortcut for show/hide.

81. **Per-workspace sidebar state** — Remember collapse state per workspace.

82. **Workspace settings UI** — Unified workspace settings surface. User says some of this already exists, needs audit.

83. **Tabbed settings interface** — Replace long-scrolling settings with tabs: General, Models, Providers, Keybindings, Safety.

84. **Broader undo-close patterns** — Today Cmd+Shift+T reopens closed sessions. Extend to workspaces, agents.

85. **Onboarding wizard + tutorial** ✅ SHIPPED (provider setup) / 🟡 PARTIAL (tutorial) — First-launch wizard with Welcome → ProviderSelect → Credentials → LocalModel → Completion fully works (`apps/electron/src/renderer/components/onboarding/OnboardingWizard.tsx`). The "PM introduces itself / guides through Brief+Goal+Features" tutorial layer does NOT exist — that's the PM+Paperclip dependency anyway.

86. **Model picker inheritance** — Default model inherited from your most recent thread, not hardcoded.

87. **Accent color persistence** ✅ SHIPPED — User-customizable accent color that persists. Full theme system via `theme.json` with live reload: `packages/shared/src/config/theme.ts`, `watcher.ts`, `validators.ts`, `apps/electron/src/renderer/hooks/useTheme.ts`. Docs at `apps/electron/resources/docs/themes.md`. Accent + info + success + destructive all customizable per-mode (light/dark). No restart needed.

88. **Fix: typing indicator stays until first AI token** — Today the typing indicator can clear before the AI actually responds.

89. **Real token-by-token streaming in chat** — Live streaming instead of spinner → full reply.

---

## Review / Approval

90. **Apply / Review queue (full E2E)** — Structured review queue: approve → applies; reject → discards; request-changes → changes flow; rollback to checkpoint. The infrastructure existed in old Rowl but was never end-to-end.

91. **Rich diff panel** — Side-by-side diff, syntax highlighting, inline comment threads, approve/reject per-file in multi-file changes, "Apply selected" for partial approval.

92. **Checkpoint comparison + rollback UI** — "Go back to before the AI did this" in plain English. Side-by-side before-after comparison.

93. **Full turn-level undo with redo stack** 🟡 PARTIAL — Undo the last turn; redo stack in case you change your mind. Only a route-parser hook referencing undo; no state machine, no UI, no redo stack.

94. **Bulk "trim old context" action** — Single button that compresses all context nodes older than N turns.

95. **Per-file approve/reject on multi-file changes** — Check individual files and apply only those.

---

## Voice / Input / Sharing

96. **Voice input** — Faster-Whisper transcription with a Haiku cleanup layer that adds codebase context (corrects "react" → "React," "Babel" → "@babel/parser" etc.). Voice commands like "computer, run this." Deprioritized but written up in detail.

97. **Thread sharing** — Export a thread as a shareable link, import someone else's thread, share/unshare. Existed in old Rowl; audit what rowl-v2 inherits from craft-agents.

98. **Image attachments on messages** ✅ SHIPPED — Up to 8 images per message. Works end-to-end: `AttachmentPreview.tsx`, `FileAttachment` type in `apps/electron/src/shared/types.ts:184`, thumbnails in `UserMessageBubble.tsx`, persistence via `SessionManager.storeAttachment()`. The "8-image cap" is architectural capacity, not a hard UI gate — add it if we want the limit enforced visually.

99. **Queue / steer mid-turn** 🟡 PARTIAL — Type a follow-up while the agent is responding; it queues and fires after the current turn. `queuedMessages` array exists in `protocol/dto.ts` interrupted event; `FreeFormInput.tsx:619-668` has plan-execution queueing. Infrastructure is there for plan-approval flow, not generalized to every mid-turn message.

100. **Remote pairing / device auth** — Pair a phone/second machine to steer the desktop app remotely.

101. **Auto-updater** — In-app auto-update.

---

## Codebase map (Live Map) follow-ups

102. **Proper d3-force map layout** — Replace homebrew physics with proper collision detection, zoom-to-fit, directory grouping, rich tooltips, edge-glow with file-path labels.

---

## Memory ergonomics

103. **Memory auto-extraction inline feedback** — In-chat confirmation when Overseer auto-writes memory ("3 decisions saved").

104. **Memory importance stars + importance-aware injection** — Per-block importance rating; injection engine weights higher-importance blocks when space is tight.

105. **Natural-language memory search** — "Remember when we…" style query instead of exact-match search.

---

## Skills

106. **Skill creation UI (AI-generated SKILL.md)** 🟡 PARTIAL — "Describe what you need" → AI generates a full SKILL.md for `.rowl/skills/`. `SkillInfoPage.tsx` shows/reveals SKILL.md; `SkillsListPanel.tsx:62-71` has "Add Skill" button. The AI-generation flow is what's missing.

107. **Skill preview + inline edit** — Click a skill to see full content; edit inline; see generation status and link to the thread that produced it.

---

## Threads

108. **Thread search + unread indicators** ✅ SHIPPED — Full search UI (SessionSearchHeader with input, result count, content search, highlighting, no-results empty state, clear-search button). Cmd+F trigger + buried dropdown entry. Unread accent dot renders on SessionItem (line 135 `hasUnreadMeta(item)`), workspace-level unread aggregation on WorkspaceAvatar. State machine in App.tsx for viewing detection. Only minor gap: no visible magnifying-glass button in sidebar chrome — UX polish, not a feature gap.

---

## Infra / culture

109. **Test coverage discipline (66+ per feature)** — Deliberate, Valo-style testing culture with multi-agent verification (researcher/reviewer/challenger).

110. **TurboQuant-style KV cache compression** — Research pattern, possibly integration target.

111. **WikiLLM-style knowledge compilation** — Parallel research + source ingestion pattern. Partially overlaps with Paperclip sub-project.

112. **Superpowers skills as methodology layer** — Adopt the skill patterns (brainstorming, TDD, subagent-driven-dev, verification-before-completion) as Rowl's built-in methodology.

113. **Cross-tab invalidation + shared data hooks** — When any sidebar mutation succeeds, every sidebar query for the project invalidates. Unified `useSidebar*` hooks.

114. **Cross-tab navigation event bus** — `navigateToTab(tab, focus)` so clicking an agent in one panel scrolls-and-highlights in another.

115. **Error-boundary + toast pattern for sidebar** — Replace silent `catch {}` with toasts that surface failures ("Failed to create goal").

---

## Summary by category

| Category | Count |
|---|---|
| Memory | 14 |
| Organizing layer (Paperclip) | 11 |
| Control room / dashboard | 14 |
| Context / visibility | 10 |
| Niche eng (t3code) | 12 |
| Multi-agent / multi-provider | 9 |
| Multi-medium (video/image/docs) | 5 |
| UX / chrome | 14 |
| Review / approval | 6 |
| Voice / input / sharing | 6 |
| Codebase map | 1 |
| Memory ergonomics | 3 |
| Skills | 2 |
| Threads | 1 |
| Infra / culture | 7 |
| **Total** | **115** |

---

## Recovery candidates — audit results (2026-04-20)

21 features from old Rowl were flagged as "cheapest wins" because design + (some) code existed. After auditing rowl-v2:

### ✅ Already shipped (6) — cross off the list
- **#25** Smart session titles — fully wired in `title-generator.ts` + `SessionManager`
- **#53** Composer draft persistence — debounced save/restore in `FreeFormInput.tsx`
- **#85** Onboarding wizard — full provider-setup flow (tutorial layer missing but that needs PM first)
- **#87** Accent color persistence — theme.json system with live reload
- **#98** Image attachments — end-to-end, thumbnails, persistence
- **#108** Thread search + unread indicators — Cmd+F search, accent-dot indicator, workspace rollup (minor: no visible search button in chrome)

### 🟡 Partial (6) — cheaper to finish than build from scratch
- **#50** Turn-level checkpoints — some git infra, no UI
- **#51** Per-session worktrees — code comment only
- **#55** Plan mode — **full type system exists**, tools blocked in agent, no UI
- **#93** Undo/redo — route-parser hook only
- **#99** Queue/steer mid-turn — queueing infra for plan approval, not generalized
- **#106** Skills UI — reveal/edit works, no AI-gen flow

### ❌ Believed missing (9) — greenfield (but verify before building — audit keeps finding things shipped)
- **#22** Features Kanban
- **#23** Feature ↔ thread linking
- **#26** Overseer / Guardian
- **#30** PM Chat
- **#32** Project dashboard
- **#37** Live Map
- **#52** Stacked PRs
- **#97** Thread sharing
- **#113** Cross-tab invalidation pattern

### Audit meta-lesson (2026-04-20)
First audit pass flagged many items as missing/partial that turned out to already be shipped in rowl-v2 via the craft-agents inheritance. Every time a "cheap build" was picked, verifying the code revealed it was already there. **Rule going forward:** before building any item on this list, verify in the actual renderer UI — grep alone isn't enough.

---

## References (where this list came from)

**rowl-v2:**
- `docs/ROADMAP.md`
- `docs/STATE.md`
- `docs/plans/right-sidebar-redesign/BRAINSTORM.md`
- `docs/plans/rowl-memory-first/SPEC.md`

**Old rowl (`/Users/mauriello/Dev/rowl/`, frozen):**
- `docs/ROWL_VISION.md`
- `docs/ROWL_ROADMAP.md` (V1)
- `docs/ROWL_ROADMAP_V2.md`
- `docs/FEATURE_SPECIFICATIONS.md`
- `docs/codebase-analysis/MASTER_SYNTHESIS.md`
- `docs/superpowers/specs/2026-04-13-comprehensive-build-plan.md`
- `docs/superpowers/specs/2026-04-13-sidebar-deep-improvements-design.md`
- `docs/superpowers/specs/2026-04-13-sidebar-connections-design.md`
- `docs/superpowers/specs/2026-04-13-remaining-work.md`
- `plans/INDEX.md`
- `plans/rowl-memory-first/SPEC.md` + `RESEARCH.md`
- `plans/rowl-right-sidebar/SPEC.md`
- `plans/rowl-outstanding/SPEC.md` + `PLAN.md`
- `plans/rowl-overseer-hardening/SPEC.md`
- `plans/rowl-codebase-context/SPEC.md`
