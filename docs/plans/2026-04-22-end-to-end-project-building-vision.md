# Rowl White Paper — The Complete Project Studio

> **Version:** 1.0  
> **Date:** 2026-04-22  
> **Status:** Draft — open for feedback  
> **Horizon:** 12–24 months  

---

## Executive Summary

The agent-tool landscape is fragmented. Today, a product team uses Perplexity for research, Midjourney for images, Cursor for code, and Vercel for deployment — with no connective tissue between them. Insights die in chat threads. Assets rot in cloud folders. The agent that writes your code has no memory of the research that informed it.

**Rowl is the complete project studio:** one connected workflow from research → content creation → software development → publishing, with memory-first agents orchestrating every stage.

Every artifact — a research insight, a generated image, a code commit, a user metric — lives in a single **project graph** stored as plain files in your workspace. Agents read from and write to this graph, so the output of one stage becomes the input of the next without copy-paste or context loss.

Rowl is built as a deliberate synthesis of four best-in-class open-source projects:
- **Craft Agents OSS** (Apache-2.0) — UI / Electron base + runtime
- **Letta Code** (MIT) — Memory-first agent architecture
- **Paperclip** (Apache-2.0) — Goal → Issue → Document organizing layer
- **T3 Code** (MIT) — Git-native engineering workflows

This white paper describes the architecture, the four-stage workflow, the competitive landscape, and the phased implementation roadmap.

---

## 1. The Problem

### 1.1 Fragmentation

| Stage | Today's tool | What happens to the output |
|---|---|---|
| Research | Perplexity, Feynman, Google Docs | Static text. No link to the product it informs. |
| Content | Flora, Midjourney, Dropbox | Orphaned assets. The code that uses them has no idea they exist. |
| Software | Cursor, Copilot, Craft Agents | Agent has no memory of research insights or brand voice. |
| Publish | Vercel, Webflow, GA | Analytics live in a dashboard, never feed back into the agent. |

### 1.2 Context Loss

When a developer switches from research to coding, they copy-paste insights into comments or Slack. When a designer generates a hero image, they download it and drag it into the repo. When a PM reads analytics, they file a ticket — manually — if they remember.

The agent that writes your React component has never seen your competitive analysis. The agent that writes your landing page copy has never read your `persona.md`. The agent that deploys your app has never seen your analytics.

### 1.3 The Cost

- **Rework:** Decisions made without full context get reversed later.
- **Drift:** Brand voice, research insights, and user learnings decay as teams churn.
- **Slow feedback loops:** Weeks between "ship" and "learn" because no one connects analytics to the agent that can act on them.

---

## 2. The Solution: Rowl

### 2.1 Core Principle

> **The project graph is the product.**

Every stage reads from and writes to a single project graph stored as plain files in the workspace. There is no proprietary database, no cloud lock-in. `git clone` a Rowl project and you get the research docs, memory blocks, asset manifests, checkpoint history, and deployment config.

### 2.2 The Four Stages

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   RESEARCH  │────▶│   CONTENT   │────▶│    BUILD    │────▶│  PUBLISH    │
│  & INSIGHT  │     │  CREATION   │     │  SOFTWARE   │     │  & MEASURE  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       └───────────────────┴───────────────────┴───────────────────┘
                           Shared project graph
                    (memory blocks + goal/issue/docs + assets)
```

### 2.3 The Project Graph

```
my-project/
├── memory/                    # Letta-style always-on memory
│   ├── persona.md             # Brand voice, target audience
│   ├── human.md               # User preferences, relationship context
│   ├── project.md             # Technical decisions, conventions
│   └── .history.jsonl         # Audit log of every memory edit
├── goals/                     # Paperclip-style organizing layer
│   ├── GOAL-001.json
│   └── GOAL-001/
│       ├── issues/
│       ├── documents/
│       └── feedback/
├── assets/                    # Stage 2 content library
│   ├── images/
│   ├── video/
│   └── copy/
├── .rowl/                     # Rowl-managed metadata
│   ├── checkpoints/           # T3code-style per-turn git checkpoints
│   ├── deploy.json            # Stage 4 deploy targets
│   └── analytics-cache/
└── src/                       # Stage 3 (your code)
```

**Key design decision:** Plain files + JSON. No database. The project graph is version-controlled, forkable, and inspectable with standard tools.

---

## 3. Stage 1 — Research & Insight

### 3.1 What It Is

The agent helps you understand the problem space before you build. Research output is not a one-off answer — it's a living document that evolves as new data arrives.

### 3.2 Capabilities

- **Structured research queries** — "Analyze the top 5 competitors in X space and extract pricing models, key features, and user complaints." Agent produces a cited brief with provenance tracking.
- **Survey synthesis** — Connect Typeform/Google Forms → agent reads responses, clusters themes, surfaces unexpected patterns, suggests follow-up questions.
- **User interview analysis** — Upload call recordings (or connect Otter/Fireflies) → agent extracts quotes, sentiment, feature requests, and links them to existing goals/issues.
- **Living research docs** — Research output is a first-class Paperclip-style Document, versioned, linked to goals, and updated as new data arrives.
- **Research watch** — "Monitor arXiv for papers on mechanistic interpretability" → agent polls sources, appends new findings to the research doc, surfaces deltas.

### 3.3 Reference: Feynman

[Feynman](https://github.com/getcompanion-ai/feynman) is an open-source research CLI built on the Pi runtime (the same agent runtime Craft Agents OSS uses). It ships four research subagents — Researcher, Reviewer, Writer, Verifier — and structured workflows for deep research, literature review, paper auditing, and experiment replication.

**What Rowl steals:** The 4-agent pattern (Researcher → Reviewer → Writer → Verifier), provenance sidecars, slug-based naming, and `CHANGELOG.md` as a lab notebook.

**What Rowl improves:** Feynman outputs loose files. Rowl outputs structured Documents linked to Goals and Issues, so research insights flow directly into the build stage.

### 3.4 Integration Point

Research docs become memory blocks (`research/*.md`) that the build-stage agent reads automatically. A user complaint extracted in Stage 1 becomes a GitHub issue in Stage 3 with one click.

---

## 4. Stage 2 — Content Creation

### 4.1 What It Is

Generate and manage the non-code artifacts that surround a product: images, video, copy, social posts, landing pages.

### 4.2 Capabilities

- **Image generation pipeline** — Connect Flora / Midjourney / Replicate APIs. Agent writes prompts based on brand voice (from `persona.md` / `project.md`), generates variants, lets you pick or A/B test.
- **Video generation pipeline** — Connect Flow / Flashboards / Kling. Agent scripts from product copy, generates storyboards, produces short-form content.
- **Asset library** — All generated content lives in the project graph, tagged by campaign, goal, and usage location ("used in `landing-hero-v2.tsx`"). No more orphaned assets in cloud storage.
- **Copy generation** — Landing page copy, email sequences, app store descriptions — all generated with full project context (research insights + brand voice + target persona).
- **Content ↔ code linkage** — Changing a headline in the content stage optionally propagates to the React component that renders it. Agent suggests the code change.

### 4.3 Integration Point

Content assets are referenced in code via project-graph URLs (not hardcoded paths), so the agent knows which image is used where and can suggest replacements.

---

## 5. Stage 3 — Software Development

### 5.1 Current Foundation

This is the core Rowl experience today, built from the four-source synthesis:

| Layer | Source | Status |
|---|---|---|
| UI / Electron base + runtime | Craft Agents OSS | ✅ Shipped (sub-project #0) |
| Memory-first agent architecture | Letta Code | ✅ Phase 1+2 shipped; Phase 3 open |
| Organizing layer (Goal → Issue → Document) | Paperclip | 🟡 UI chrome shipped; data model pending |
| Git-native engineering workflows | T3 Code | ⏸ Not started (sub-project #3) |

### 5.2 Future Additions

- **Browser preview** — Built-in browser pane so the agent can see what it built. Screenshots → vision model for visual regression / layout feedback.
- **Component library integration** — Agent knows your design system and suggests existing components before generating new ones.
- **Testing agent** — Auto-generated tests from user stories (linked to Issues). Runs in background, reports regressions as new Issues.
- **Multi-repo projects** — A single Rowl project can span multiple git repos (backend + frontend + mobile), with cross-repo context awareness.

---

## 6. Stage 4 — Publish & Measure

### 6.1 What It Is

Ship what you built, then feed real-world signal back into the project graph.

### 6.2 Capabilities

- **1-click deploy** — Vercel/Netlify/Railway integration. Agent knows your deploy config and can debug build failures.
- **Analytics ingestion** — Connect PostHog/Amplitude/GA → agent reads funnel data, cohort retention, error rates.
- **Insight → action loop** — "Conversion on the new pricing page dropped 12%" → agent opens an Issue with suggested A/B variants, linked to the research doc that informed the original pricing strategy.
- **Social publishing** — Schedule and publish content from Stage 2, track engagement, feed top-performing copy back into `project.md` as "what resonates."
- **Feedback collection** — In-app feedback widget → agent clusters submissions, links to existing Issues or creates new ones.

### 6.3 Key Insight

Publishing is not an endpoint — it's a new input stream. Analytics events, user feedback, and social metrics all write into the project graph, making the agent smarter about what to build next.

---

## 7. Technical Architecture

### 7.1 Agent Orchestration

Rowl uses a **hub-and-spoke** model. A central session agent (Claude or Pi) coordinates specialized subagents:

- **Research subagent** — Feynman-style, dispatched for deep investigations
- **Content subagent** — Dispatched for asset generation pipelines
- **Build subagent** — The core coding agent (today's Rowl session)
- **Publish subagent** — Dispatched for deploy and analytics tasks

Each subagent reads from the project graph and writes back to it. The central agent maintains continuity across subagent calls.

### 7.2 Memory Model

Letta-style memory blocks provide always-on context:

- **`persona.md`** — Brand voice, communication style, target audience
- **`human.md`** — User preferences, relationship history, personal context
- **`project.md`** — Technical decisions, conventions, stack choices
- **Research blocks** — `research/competitors.md`, `research/user-interviews.md`, etc.
- **Content blocks** — `content/brand-guidelines.md`, `content/what-resonates.md`

Blocks are injected into every agent turn via an XML wrapper at the top of context. Agents can edit blocks via `core_memory_replace` and `core_memory_append` tools.

### 7.3 Context Budget Management

With 1M+ context windows (opt-in) and multi-modal content, context management is critical:

- **Memory blocks** are always-on but kept concise (soft 16KB warn threshold)
- **Research docs** are retrieved via RAG when referenced, not injected wholesale
- **Asset references** use project-graph URLs + embeddings; only the reference (not the asset itself) enters context
- **Checkpoints** (T3code-style) store full turn state on disk, not in context

---

## 8. Competitive Analysis

| Tool | Strength | Gap Rowl fills |
|---|---|---|
| **Cursor / Copilot** | Fast, code-only | No research, content, or publishing. No persistent project memory. |
| **Craft Agents** | Sessions + skills, Mac-native | No organizing layer, no content stage, no publish loop. |
| **Perplexity** | Research answers | No project continuity. Today's answer is tomorrow's orphan. |
| **Flora / Flow** | Content generation | No link to the product that uses the content. No code awareness. |
| **Vercel v0** | Prototype → deploy | No research, no memory, no ongoing agent. One-shot. |
| **Feynman** | Research companion | Narrow scope. No build or publish. Output is loose files, not structured docs. |

**Rowl's moat:** Not any single stage, but the **continuity between stages** — the project graph that lets an agent carry context from research insight all the way through to deployed code and back again.

---

## 9. Implementation Roadmap

| Phase | What | Depends on | Target |
|---|---|---|---|
| **Now** | Sub-projects #0–#3 (base + memory + organizing layer + t3code features) | — | Q2 2026 |
| **Phase A** | Research stage (Feynman pattern port + structured query surface + living research docs) | #2 data model | Q3 2026 |
| **Phase B** | Content stage (image/video pipeline + asset library + copy generation) | Phase A | Q3–Q4 2026 |
| **Phase C** | Browser preview + visual regression agent | #3 (t3code base) | Q4 2026 |
| **Phase D** | Publishing stage (deploy integration + analytics ingestion + feedback loop) | Phase B + C | Q1 2027 |
| **Phase E** | Cross-stage orchestration (end-to-end autonomous pipeline) | All above | Q2 2027 |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Content API vendor lock-in (Flora/Flow) | Medium | High | Design asset pipeline with adapter pattern; keep ComfyUI/self-hosted as fallback |
| Context window limits with multi-modal assets | Medium | Medium | Asset embeddings + RAG; only references enter context |
| Analytics write-back feels invasive | Low | Medium | Agent suggests actions; human approves before any write |
| T3code port is larger than expected | Medium | Medium | Scope sub-project #3 as incremental: checkpoints first, then worktrees, then stacked PRs |
| Paperclip data model doesn't fit Craft's session model | Low | High | Prototype with lightweight JSON schema before full port; validate with real usage |

---

## 11. Open Questions

1. **Feynman integration depth** — Emulate patterns or embed as dependency? *(Resolved: emulate patterns — see §3.3)*
2. **Content pipeline vendor lock-in** — Flora/Flow APIs vs. self-hosted ComfyUI + open models?
3. **Browser preview architecture** — Embed headless browser in Electron? Use Playwright?
4. **Analytics write-back permissions** — Agent suggests, human approves? Or fully autonomous?
5. **Multi-modal context budget** — Asset embeddings + retrieval? Or structured metadata only?

---

## 12. Research Action Items

| Project | URL | Question | Priority | Status |
|---|---|---|---|---|
| Feynman | https://github.com/getcompanion-ai/feynman | Architecture, 4-agent pattern, provenance model | **P0** | ✅ Cloned to `_reference/feynman` |
| T3 Code | https://github.com/pingdotgg/t3code | Git worktrees, 1-click PRs, checkpoints — port scope | P1 | Pending |
| Paperclip | https://github.com/paperclipai/paperclip | Multi-agent orchestration, goal ancestry | P2 | Pending |
| Letta | https://github.com/letta-ai/letta-code | Skills marketplace, reminder engine | P2 | Pending |

---

*Last updated: 2026-04-22*
