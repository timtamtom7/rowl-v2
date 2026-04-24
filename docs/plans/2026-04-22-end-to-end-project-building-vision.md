# Rowl Vision — End-to-End Project Building

> **Document type:** Strategic vision / long-range roadmap  
> **Horizon:** 12–24 months  
> **Scope:** Beyond the current 4-sub-project synthesis. This describes what Rowl becomes once the foundation is complete.

---

## The one-sentence vision

**Rowl is the complete project studio:** one connected workflow from research → content → software → published product, with memory-first agents orchestrating every stage.

---

## Why this matters now

The current agent-tool landscape is fragmented:
- **Research:** Perplexity, Feynman, traditional surveys — output is text, disconnected from what you build next.
- **Content:** Flora, Flow, Flashboards, Midjourney — generate images/video, but the assets live in Dropbox folders with no link to the code or copy that uses them.
- **Software:** Craft Agents, Cursor, Copilot — write code, but the surrounding context (research insights, brand voice, content assets) is invisible to the agent.
- **Publishing:** Vercel, Webflow, social schedulers — push live, but the feedback loop (analytics → product changes) is manual and slow.

**Rowl closes the loop.** Every artifact — a research insight, a generated image, a code commit, a user metric — lives in one project graph. Agents read from and write to that graph, so the output of one stage becomes the input of the next without copy-paste or context loss.

---

## The four stages

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

---

### Stage 1 — Research & Insight

**What it is:** The agent helps you understand the problem space before you build.

**Capabilities:**
- **Structured research queries** — "Analyze the top 5 competitors in X space and extract their pricing models, key features, and user complaints." Agent produces a living document, not a one-off answer.
- **Survey synthesis** — Connect Typeform/Google Forms → agent reads responses, clusters themes, surfaces unexpected patterns, suggests follow-up questions.
- **User interview analysis** — Upload call recordings (or connect Otter/Fireflies) → agent extracts quotes, sentiment, feature requests, and links them to existing goals/issues.
- **Living research docs** — Research output is a first-class Paperclip-style Document, versioned, linked to goals, and updated as new data arrives.

**Reference projects to study:**
- [Feynman](https://github.com/getcompanion-ai/feynman) — open-source research companion. Evaluate: how does it structure research queries? Does it have a document model we can align with?
- Perplexity (closed, but pattern-reference) — citation-backed answers, source transparency.

**Rowl integration point:** Research docs become memory blocks (`research/*.md`) that the build-stage agent reads automatically. A user complaint extracted in Stage 1 becomes a GitHub issue in Stage 3 with one click.

---

### Stage 2 — Content Creation

**What it is:** Generate and manage the non-code artifacts that surround a product: images, video, copy, social posts, landing pages.

**Capabilities:**
- **Image generation pipeline** — Connect Flora / Midjourney / Replicate APIs. Agent writes prompts based on brand voice (from `persona.md` / `project.md`), generates variants, lets you pick or A/B test.
- **Video generation pipeline** — Connect Flow / Flashboards / Kling. Agent scripts from product copy, generates storyboards, produces short-form content.
- **Asset library** — All generated content lives in the project graph, tagged by campaign, goal, and usage location ("used in landing-hero-v2.tsx"). No more orphaned assets in cloud storage.
- **Copy generation** — Landing page copy, email sequences, app store descriptions — all generated with full project context (research insights + brand voice + target persona).
- **Content ↔ code linkage** — Changing a headline in the content stage optionally propagates to the React component that renders it. Agent suggests the code change.

**Reference projects to study:**
- [Flora](https://flora.ai) — AI-native design tool. Evaluate API surface, project model, asset versioning.
- [Flow](https://flowgpt.com) — video generation workflows. Evaluate: can we trigger flows from agent actions?
- [Flashboards](https://flashboards.ai) — content boards. Evaluate: how do they organize multi-format creative projects?

**Rowl integration point:** Content assets are referenced in code via project-graph URLs (not hardcoded paths), so the agent knows which image is used where and can suggest replacements.

---

### Stage 3 — Software Development

**What it is:** The core Rowl experience today, expanded. This is where the current sub-projects (#0–#3) live.

**Current foundation (shipped or in progress):**
- Craft Agents OSS base — sessions, skills/MCP, multi-provider LLM, Mac-native UI.
- Letta-style memory — always-on workspace blocks (`persona.md`, `human.md`, `project.md`), agent-editable via tools.
- Paperclip-style organizing layer — Goal → Issue → Document/Feedback/Approval (sub-project #2, data model not yet ported).
- t3code features — git checkpoints per turn, worktrees, stacked PRs, context meter (sub-project #3, not started).

**Future additions:**
- **Browser preview** — Built-in browser pane (like Zed's or T3 Code's) so the agent can see what it built. Screenshots → vision model for visual regression / layout feedback.
- **Component library integration** — Agent knows your design system (from Storybook or equivalent) and suggests existing components before generating new ones.
- **Testing agent** — Auto-generated tests from user stories (linked to Issues). Runs in background, reports regressions as new Issues.
- **Multi-repo projects** — A single Rowl project can span multiple git repos (backend + frontend + mobile), with cross-repo context awareness.

**Reference projects to study:**
- [T3 Code](https://github.com/pingdotgg/t3code) — git worktrees, 1-click PR workflow, stacked PRs. High-priority port for sub-project #3.
- [Zed](https://zed.dev) — native performance, built-in terminal, browser preview. UI pattern reference.

---

### Stage 4 — Publish & Measure

**What it is:** Ship what you built, then feed real-world signal back into the project graph.

**Capabilities:**
- **1-click deploy** — Vercel/Netlify/Railway integration. Agent knows your deploy config and can debug build failures.
- **Analytics ingestion** — Connect PostHog/Amplitude/GA → agent reads funnel data, cohort retention, error rates.
- **Insight → action loop** — "Conversion on the new pricing page dropped 12%" → agent opens an Issue with suggested A/B variants, linked to the research doc that informed the original pricing strategy.
- **Social publishing** — Schedule and publish content from Stage 2, track engagement, feed top-performing copy back into `project.md` as "what resonates."
- **Feedback collection** — In-app feedback widget → agent clusters submissions, links to existing Issues or creates new ones.

**Rowl integration point:** Publishing is not an endpoint — it's a new input stream. Analytics events, user feedback, and social metrics all write into the project graph, making the agent smarter about what to build next.

---

## The project graph: shared substrate

All four stages read from and write to a single **project graph** stored at the workspace root:

```
my-project/
├── memory/                    # Sub-project #1 (Letta-style)
│   ├── persona.md
│   ├── human.md
│   ├── project.md
│   └── .history.jsonl
├── goals/                     # Sub-project #2 (Paperclip-style)
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
│   ├── checkpoints/           # Sub-project #3 (t3code-style)
│   ├── deploy.json            # Stage 4 deploy targets
│   └── analytics-cache/
└── src/                       # Stage 3 (your code)
```

**Key principle:** The project graph is plain files + JSON. No proprietary database. You can `git clone` a Rowl project and every stage's state is there — research docs, memory blocks, asset manifests, checkpoint history.

---

## Milestone sequencing

| Phase | What | Depends on | Target |
|---|---|---|---|
| **Now** | Sub-projects #0–#3 (base + memory + organizing layer + t3code features) | — | Q2 2026 |
| **Phase A** | Research stage (Feynman study + structured query surface + living research docs) | #2 data model | Q3 2026 |
| **Phase B** | Content stage (image/video pipeline + asset library + copy generation) | Phase A | Q3–Q4 2026 |
| **Phase C** | Browser preview + visual regression agent | #3 (t3code base) | Q4 2026 |
| **Phase D** | Publishing stage (deploy integration + analytics ingestion + feedback loop) | Phase B + C | Q1 2027 |
| **Phase E** | Cross-stage orchestration (research insight → auto-opens issue → agent generates content + code → deploys → monitors) | All above | Q2 2027 |

---

## Competitive positioning

| Tool | Does well | Gap Rowl fills |
|---|---|---|
| Cursor / Copilot | Code-only, fast | No research, content, or publishing. No persistent project memory. |
| Craft Agents | Sessions + skills, Mac-native | No organizing layer, no content stage, no publish loop. |
| Perplexity | Research answers | No project continuity. Today's answer is tomorrow's orphan. |
| Flora / Flow | Content generation | No link to the product that uses the content. No code awareness. |
| Vercel v0 | Prototype → deploy | No research, no memory, no ongoing agent. One-shot. |
| Feynman | Research companion | Open source, but narrow scope. No build or publish. |

**Rowl's moat:** Not any single stage, but the **continuity between stages** — the project graph that lets an agent carry context from research insight all the way through to deployed code and back again.

---

## Open questions (to resolve before Phase A)

1. **Feynman integration depth** — Is Feynman a reference pattern to emulate, or a dependency to embed? Read the repo, evaluate its architecture.
2. **Content pipeline vendor lock-in** — Flora/Flow APIs vs. self-hosted ComfyUI + open models. What's the cost/reliability trade-off?
3. **Browser preview architecture** — Embed a headless browser in Electron? Use Playwright? How does the agent "see" the page?
4. **Analytics write-back permissions** — Reading analytics is safe; writing insights back to Issues requires careful auth design. What does "agent opened an Issue from a metric drop" look like in practice?
5. **Multi-modal context budget** — If Stage 2 generates 50 images and Stage 3's agent needs to reference them, how do we stay within context-window limits? Asset embeddings + retrieval?

---

## Research action items

| Project | URL | Question | Priority |
|---|---|---|---|
| Feynman | https://github.com/getcompanion-ai/feynman | Architecture, document model, can we align with Paperclip goals? | **P0** — user requested |
| T3 Code | https://github.com/pingdotgg/t3code | Git worktrees, 1-click PRs, checkpoints — what's the port scope? | P1 — sub-project #3 |
| Paperclip | https://github.com/paperclipai/paperclip | Multi-agent orchestration — document for future | P2 — large scope, defer |
| Letta | https://github.com/letta-ai/letta-code | Persistent memory + skills marketplace — what's beyond what we ported? | P2 — sub-project #1 extension |

---

*Last updated: 2026-04-22*
