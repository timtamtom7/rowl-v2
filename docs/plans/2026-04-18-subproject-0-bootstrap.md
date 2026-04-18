# Rowl-v2 Sub-project #0 — Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork `craft-agents-oss` into a new repo at `/Users/mauriello/Dev/rowl-v2/`, rebrand the user-visible surfaces to "Rowl", establish the `docs/plans/` + `docs/STATE.md` convention, and verify baseline (typecheck + test + Electron smoke) is green before any feature work begins.

**Architecture:** A plain `git clone` from the local reference checkout at `/Users/mauriello/Dev/_reference/craft-agents-oss` preserves upstream history and Apache-2.0 attribution. Rebrand is deliberately shallow: only root `package.json`, `README.md`, `NOTICE`, and Electron bundle metadata. Internal identifiers (`@craft-agent/*` workspace names, file paths, imports) are left untouched to avoid scope creep and a ripple of import rewrites. Plans live inside the new repo at `docs/plans/`, with a living front door at `docs/STATE.md` (same pattern as the old `/rowl/plans/STATE.md`).

**Tech Stack:** Bun 1.x (workspaces), TypeScript 5, Electron 39, React 18, Vite 6. Inherited unchanged from craft-agents-oss.

**Out of scope (NOT this plan):**
- Memory port from `/rowl/` (phase-1a `CoreMemoryService` code, Effect-TS → plain TS translation). Separate sub-project.
- Paperclip-style goal/issue/document layer. Separate sub-project.
- t3code cherry-picks (git checkpoints, worktrees, stacked PRs). Separate sub-project.
- Provider adapter pruning (currently Claude Agent SDK + Pi SDK + Copilot). Keep as-is.
- Renaming internal package names (`@craft-agent/core`, `@craft-agent/electron`, etc.). Intentionally deferred.
- GitHub remote, CI/CD, release workflows, signing.
- Any UI changes.

---

## File Map

**Files to be modified (9):**

| Path | What changes | Rationale |
|------|--------------|-----------|
| `package.json` (root) | `name`, `description` | User-visible npm identity |
| `apps/electron/package.json` | `description`, `author`, `homepage` | Electron metadata |
| `apps/electron/electron-builder.yml` | `appId`, `productName`, `copyright` | Bundle identity (what shows in macOS "About", Dock, Finder) |
| `README.md` | Top section (title, tagline, fork attribution) | Identity + Apache-2.0 attribution |
| `NOTICE` | Appended addendum | Apache-2.0 §4(c) compliance: state modifications |

**Files to be created (3):**

| Path | Purpose |
|------|---------|
| `docs/plans/README.md` | Convention doc: how plans are structured |
| `docs/STATE.md` | Living front door — current sub-project, phase, last session handoff |
| `docs/plans/2026-04-18-subproject-0-bootstrap.md` | This plan, moved in at final task |

**Files deliberately NOT touched:**
- `LICENSE` — unchanged (Apache-2.0 requires preserving upstream license)
- `TRADEMARK.md` — unchanged (documents upstream's trademark policy; we just don't violate it)
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` — can be updated later
- All `packages/*` and `apps/*` source code — zero edits
- `bun.lock`, `bunfig.toml`, `tsconfig.json` — unchanged
- `docs/` (existing upstream docs dir) — left intact alongside new `docs/plans/` and `docs/STATE.md`

---

## Execution environment

All commands run from `/Users/mauriello/Dev/` unless explicitly `cd`-ing into `rowl-v2`. Shell is assumed to be bash or zsh with Bun on PATH.

**Prerequisite assumptions:**
- Bun is installed (`bun --version` works)
- Git is installed
- The reference repo at `/Users/mauriello/Dev/_reference/craft-agents-oss/` exists and is on its default branch
- The target path `/Users/mauriello/Dev/rowl-v2/` does NOT exist yet
- `/Users/mauriello/Dev/rowl/` (old donor repo) is untouched — we will not read from or write to it

---

### Task 1: Preflight verification

**Files:** none (read-only checks)

- [ ] **Step 1: Verify reference repo exists and is a git repo**

Run:
```bash
test -d /Users/mauriello/Dev/_reference/craft-agents-oss/.git && echo OK || echo MISSING
```
Expected: `OK`

- [ ] **Step 2: Verify target path is free**

Run:
```bash
test -e /Users/mauriello/Dev/rowl-v2 && echo EXISTS || echo FREE
```
Expected: `FREE`

If `EXISTS`, stop the plan and resolve with the user before proceeding — we will not overwrite an existing directory.

- [ ] **Step 3: Verify Bun is available**

Run:
```bash
bun --version
```
Expected: a version number (e.g., `1.x.y`). If command not found, stop and install Bun first.

- [ ] **Step 4: Record the upstream commit we're forking from**

Run:
```bash
cd /Users/mauriello/Dev/_reference/craft-agents-oss && git rev-parse HEAD
```
Expected: a 40-char commit SHA. Copy it to your scratchpad — it goes into the NOTICE addendum in Task 11.

No commit for this task. It's pure verification.

---

### Task 2: Clone craft-agents-oss → rowl-v2

**Files:**
- Create: `/Users/mauriello/Dev/rowl-v2/` (entire working tree, via clone)

- [ ] **Step 1: Clone the reference repo to the new location**

Run:
```bash
git clone /Users/mauriello/Dev/_reference/craft-agents-oss /Users/mauriello/Dev/rowl-v2
```
Expected: `Cloning into '/Users/mauriello/Dev/rowl-v2'... done.`

- [ ] **Step 2: Verify the clone has full history**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git log --oneline | wc -l
```
Expected: a number > 0 (matches upstream commit count).

- [ ] **Step 3: Verify HEAD matches the upstream SHA from Task 1, Step 4**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git rev-parse HEAD
```
Expected: same 40-char SHA recorded in Task 1, Step 4.

No commit for this task — the clone itself is the state change, and subsequent rebrand commits will sit on top.

---

### Task 3: Detach from upstream (remove origin)

**Files:** none (git config only)

Rationale: the clone sets `origin` to the local reference path. We do not want accidental pulls pulling in upstream changes, and there is no remote GitHub repo yet.

- [ ] **Step 1: Inspect current remotes**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git remote -v
```
Expected: `origin  /Users/mauriello/Dev/_reference/craft-agents-oss (fetch)` and `(push)`.

- [ ] **Step 2: Remove the origin remote**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git remote remove origin
```
Expected: no output (silent success).

- [ ] **Step 3: Verify no remotes remain**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git remote -v
```
Expected: empty output.

No commit for this task.

---

### Task 4: Baseline install (bun install)

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/bun.lock` (may or may not change; don't care)
- Create: `/Users/mauriello/Dev/rowl-v2/node_modules/` (ignored by `.gitignore`)

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun install
```
Expected: resolves workspace packages under `packages/*` and `apps/*` (minus `apps/online-docs`); exits 0. Warnings about deprecated packages are acceptable. Errors are not.

- [ ] **Step 2: Verify node_modules exists**

Run:
```bash
ls /Users/mauriello/Dev/rowl-v2/node_modules | head -5
```
Expected: 5 directory names.

- [ ] **Step 3: Verify workspace linking worked**

Run:
```bash
ls /Users/mauriello/Dev/rowl-v2/node_modules/@craft-agent 2>&1
```
Expected: a list of symlinked workspace packages (e.g., `core`, `electron`, `server`, `server-core`, `shared`, `ui`, etc.). This confirms the monorepo is wired up.

No commit for this task — `node_modules` is gitignored.

---

### Task 5: Baseline typecheck

**Files:** none (verification)

- [ ] **Step 1: Run the fast typecheck first**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck
```
Expected: exits 0. This runs `typecheck:shared` which only checks `packages/shared`.

If it fails, do NOT proceed. Record the failure and stop — this indicates the reference repo is broken at this commit, which is a prerequisite issue to resolve before the fork can be usable.

- [ ] **Step 2: Run the comprehensive typecheck**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck:all
```
Expected: exits 0. Checks `packages/core`, `packages/shared`, `packages/server-core`, `packages/server`, `packages/session-tools-core`, `apps/electron`, `packages/ui`.

If this fails but Step 1 passed, we inherit a typecheck failure from upstream. Document it (save the failing output to `/tmp/rowl-v2-baseline-typecheck.log`) and decide with the user whether to treat it as a known-broken baseline or stop.

No commit for this task.

---

### Task 6: Baseline tests

**Files:** none (verification)

- [ ] **Step 1: Run the test suite**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun test 2>&1 | tee /tmp/rowl-v2-baseline-test.log
```
Expected: exits 0 with a summary like `X pass, 0 fail`.

Note: the root `"test"` script is:
```
bun test && for f in $(find . -name '*.isolated.ts' -not -path './node_modules/*'); do bun test "$f" || exit 1; done
```
It runs the unit tests then re-runs any `*.isolated.ts` files in isolated processes. Both must pass.

- [ ] **Step 2: If tests fail, decide with user before proceeding**

If failures exist, `/tmp/rowl-v2-baseline-test.log` has the output. Stop and surface to user — we will not accept a red baseline silently.

If tests pass, continue.

No commit for this task.

---

### Task 7: Baseline Electron build + smoke

**Files:**
- Create (ignored): `/Users/mauriello/Dev/rowl-v2/apps/electron/dist/` (build output)

- [ ] **Step 1: Build the Electron app (all stages)**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:build
```
Expected: exits 0. Builds main, preload, renderer, resources, and copies assets. Output lands in `apps/electron/dist/`.

- [ ] **Step 2: Verify the main bundle exists**

Run:
```bash
ls -la /Users/mauriello/Dev/rowl-v2/apps/electron/dist/main.cjs
```
Expected: file exists, size > 0.

- [ ] **Step 3: Launch Electron in smoke-check mode (human verification)**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:start
```
Expected: an Electron window opens showing the craft-agents-oss UI (still branded as "Craft Agents" — rebrand comes later). Close the window after confirming it rendered.

If the window fails to open, record the terminal output and stop. The baseline Electron experience must work before we rebrand.

- [ ] **Step 4: Record baseline-green state in a scratch file**

Run:
```bash
echo "baseline green at $(cd /Users/mauriello/Dev/rowl-v2 && git rev-parse HEAD) on $(date)" > /tmp/rowl-v2-baseline.txt
```
Expected: no output.

No commit for this task. `dist/` is gitignored.

---

### Task 8: Rebrand — root `package.json`

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/package.json` (lines 2, 5)

- [ ] **Step 1: Show current values**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && head -10 package.json
```
Expected: confirms `"name": "craft-agent"` and `"description": "Claude Code-like agent for Craft documents"`.

- [ ] **Step 2: Update `name` field**

Edit `/Users/mauriello/Dev/rowl-v2/package.json`:

Old:
```json
  "name": "craft-agent",
```

New:
```json
  "name": "rowl",
```

- [ ] **Step 3: Update `description` field**

Edit `/Users/mauriello/Dev/rowl-v2/package.json`:

Old:
```json
  "description": "Claude Code-like agent for Craft documents",
```

New:
```json
  "description": "Rowl — memory-first coding agent. Fork of craft-agents-oss.",
```

- [ ] **Step 4: Verify typecheck still passes**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add package.json && git commit -m "chore(rebrand): rename root package to 'rowl'"
```
Expected: one file changed, commit created.

---

### Task 9: Rebrand — `apps/electron/package.json`

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/apps/electron/package.json` (description, author, homepage)

Note: we are NOT changing the `"name": "@craft-agent/electron"` field. Internal workspace names stay identical to avoid a sweep of import-rewrite changes across the monorepo. This is the "minimal rebrand" decision locked during brainstorming.

- [ ] **Step 1: Show current values**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && head -12 apps/electron/package.json
```
Expected: confirms `"description": "Electron desktop app for Craft Agents"`, `"author": { "name": "Craft Docs Ltd." ... }`, `"homepage": "https://agents.craft.do"`.

- [ ] **Step 2: Update `description`**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/package.json`:

Old:
```json
  "description": "Electron desktop app for Craft Agents",
```

New:
```json
  "description": "Electron desktop app for Rowl",
```

- [ ] **Step 3: Replace `author` block with fork-appropriate value**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/package.json`:

Old:
```json
  "author": {
    "name": "Craft Docs Ltd.",
    "email": "support@craft.do"
  },
```

New:
```json
  "author": {
    "name": "Rowl Contributors"
  },
```

(Email intentionally omitted — no support address set up yet. Add later if/when one exists.)

- [ ] **Step 4: Remove `homepage` field**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/package.json`:

Old:
```json
  "homepage": "https://agents.craft.do",
```

New: (delete the line entirely, including the trailing comma)

If removing the line leaves an invalid JSON trailing comma on the preceding line, fix the preceding line's comma too.

- [ ] **Step 5: Verify file still parses as JSON**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun -e 'console.log(JSON.parse(require("fs").readFileSync("apps/electron/package.json","utf8")).description)'
```
Expected: prints `Electron desktop app for Rowl`.

- [ ] **Step 6: Verify typecheck still passes**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck:electron
```
Expected: exits 0.

- [ ] **Step 7: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add apps/electron/package.json && git commit -m "chore(rebrand): update electron package metadata"
```

---

### Task 10: Rebrand — `electron-builder.yml`

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/apps/electron/electron-builder.yml` (lines 1-3)

This is the most user-visible rebrand: `productName` shows in macOS's About dialog, the Dock, Finder; `appId` is the bundle identifier stored in OS keychains and settings; `copyright` shows in the About dialog.

**Legal note:** TRADEMARK.md from upstream explicitly forbids using "Craft" or "Craft Agents" branding on forks. This task is what makes the fork trademark-compliant.

- [ ] **Step 1: Show current values**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && head -5 apps/electron/electron-builder.yml
```
Expected:
```
appId: com.lukilabs.craft-agent
productName: Craft Agents
copyright: Copyright © 2026 Craft Docs Ltd.
```

- [ ] **Step 2: Update `appId`**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/electron-builder.yml`:

Old:
```
appId: com.lukilabs.craft-agent
```

New:
```
appId: dev.rowl.app
```

(`dev.rowl.app` is a reverse-DNS string we control by convention. It does not require owning the `rowl.dev` domain — Apple only uses this as a unique string. If you later register a real domain, this can be updated.)

- [ ] **Step 3: Update `productName`**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/electron-builder.yml`:

Old:
```
productName: Craft Agents
```

New:
```
productName: Rowl
```

- [ ] **Step 4: Update `copyright`**

Edit `/Users/mauriello/Dev/rowl-v2/apps/electron/electron-builder.yml`:

Old:
```
copyright: Copyright © 2026 Craft Docs Ltd.
```

New:
```
copyright: Copyright © 2026 Rowl Contributors. Based on Craft Agents © 2026 Craft Docs Ltd.
```

(The dual attribution satisfies both our identity and Apache-2.0 §4(c) — factual acknowledgment of the base.)

- [ ] **Step 5: Verify YAML still parses**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun -e 'const yaml=require("js-yaml");const fs=require("fs");const doc=yaml.load(fs.readFileSync("apps/electron/electron-builder.yml","utf8"));console.log(doc.appId, "|", doc.productName);'
```
Expected: `dev.rowl.app | Rowl`

- [ ] **Step 6: Rebuild Electron to confirm nothing broke**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:build
```
Expected: exits 0.

- [ ] **Step 7: Launch to visually confirm rebrand**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:start
```
Expected: Electron window opens; macOS menu bar shows "Rowl" (may say "Electron" in dev mode — that's a known electron-dev quirk, fine for now); Dock icon tooltip shows "Rowl" or "Electron" in dev.

In a packaged build (not this task), productName would be authoritative. For dev, "Electron" showing is normal.

- [ ] **Step 8: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add apps/electron/electron-builder.yml && git commit -m "chore(rebrand): set bundle identity to Rowl in electron-builder.yml"
```

---

### Task 11: Apache-2.0 attribution — `NOTICE` addendum

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/NOTICE` (append)

Apache-2.0 §4(c): derivative works must carry the original NOTICE plus any of their own notices. We keep the entire upstream NOTICE and append our addendum. We do NOT rewrite or remove any existing line.

- [ ] **Step 1: Show current NOTICE contents**

Run:
```bash
cat /Users/mauriello/Dev/rowl-v2/NOTICE
```
Expected: the upstream NOTICE (starts with "Craft Agents" / "Copyright 2026 Craft Docs Ltd."). Confirm it ends with a blank line or a final line without trailing newline — this affects how you append.

- [ ] **Step 2: Append Rowl fork addendum**

Use an editor (not `echo >>`, to avoid newline ambiguity) to append the following block to `/Users/mauriello/Dev/rowl-v2/NOTICE`. Insert a blank line between the existing content and this block if one isn't already there.

```
---

Rowl
Copyright 2026 Rowl Contributors

This product is a derivative work based on Craft Agents by Craft Docs Ltd.
Original Craft Agents source: https://github.com/lukilabs/craft-agents-oss
Forked at upstream commit: <PASTE SHA FROM TASK 1 STEP 4>

Modifications made by the Rowl project are documented in the git history
of the Rowl repository. The "Craft" and "Craft Agents" trademarks belong
to Craft Docs Ltd.; Rowl is not endorsed by or affiliated with Craft Docs Ltd.
```

Replace `<PASTE SHA FROM TASK 1 STEP 4>` with the actual 40-character SHA you recorded.

- [ ] **Step 3: Verify the upstream section is still intact**

Run:
```bash
head -15 /Users/mauriello/Dev/rowl-v2/NOTICE
```
Expected: the first lines still show "Craft Agents / Copyright 2026 Craft Docs Ltd." — we did NOT delete this.

- [ ] **Step 4: Verify the addendum appears after**

Run:
```bash
tail -15 /Users/mauriello/Dev/rowl-v2/NOTICE
```
Expected: shows the Rowl addendum block including the correct upstream SHA.

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add NOTICE && git commit -m "docs: append Rowl fork attribution to NOTICE (Apache-2.0 §4(c))"
```

---

### Task 12: Rebrand — `README.md` top section

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/README.md` (replace only the top title + tagline + first paragraph or two; leave the setup/usage body intact from upstream since it still accurately describes how to build and run)

Philosophy: the body of upstream README is still factually correct ("run `bun install`, then `bun run electron:start`"). Replacing the whole file would be make-work and would lose real setup info. We replace only the identity section.

- [ ] **Step 1: Show the first 25 lines of README**

Run:
```bash
head -25 /Users/mauriello/Dev/rowl-v2/README.md
```
Expected: shows upstream title (likely "# Craft Agents" or similar) and tagline.

- [ ] **Step 2: Replace the top identity block**

Open `/Users/mauriello/Dev/rowl-v2/README.md` in an editor. Locate the leading section — everything from the `#` title line down to (but not including) the first major setup/getting-started heading (e.g., `## Getting Started`, `## Development`, `## Installation`, or whatever exists).

Replace that entire leading block with:

```markdown
# Rowl

**Memory-first coding agent. Fork of [craft-agents-oss](https://github.com/lukilabs/craft-agents-oss).**

Rowl takes the Craft Agents Electron UI as its base and adds memory-first agent behavior (Letta-style git-backed memory blocks), a Paperclip-style goal/issue/document organizing layer, and niche engineering workflow features.

Status: early bootstrap. Nothing new wired up yet beyond rebrand.

## Attribution

This project is a derivative work of [Craft Agents](https://github.com/lukilabs/craft-agents-oss) (Apache-2.0, © Craft Docs Ltd.). See `NOTICE` for full attribution. "Craft" and "Craft Agents" are trademarks of Craft Docs Ltd. and are not used to brand Rowl per their trademark policy (`TRADEMARK.md`).

---

<!-- The sections below are inherited from craft-agents-oss and describe the technical base. They remain accurate for Rowl until changed. -->
```

Leave everything after that marker comment intact.

- [ ] **Step 3: Verify the file still renders as valid markdown**

Run:
```bash
head -20 /Users/mauriello/Dev/rowl-v2/README.md
```
Expected: shows the new Rowl title and attribution section; no leftover "Craft Agents" branding in the first 20 lines.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add README.md && git commit -m "docs(rebrand): replace README top section with Rowl identity + attribution"
```

---

### Task 13: Create `docs/plans/` convention

**Files:**
- Create: `/Users/mauriello/Dev/rowl-v2/docs/plans/README.md`

Note: the upstream `docs/` directory already exists (contains craft-agents' own docs). We add a `plans/` subdirectory alongside them; we do not delete or move any existing `docs/` content.

- [ ] **Step 1: Create the plans directory**

Run:
```bash
mkdir -p /Users/mauriello/Dev/rowl-v2/docs/plans
```
Expected: no output.

- [ ] **Step 2: Create the plans README**

Create `/Users/mauriello/Dev/rowl-v2/docs/plans/README.md` with exactly this content:

```markdown
# Rowl Plans

This directory holds implementation plans for Rowl sub-projects and phases.

## Where to start

**Always read `docs/STATE.md` first** — it's the living front door that says what sub-project is active, what phase, and what to read next. A fresh session with no prior context should be able to orient in under 60 seconds.

## Conventions

- **Plan files** live directly in this directory: `docs/plans/YYYY-MM-DD-<slug>.md`.
  - Example: `docs/plans/2026-04-18-subproject-0-bootstrap.md`
- **Multi-phase sub-projects** get their own subdirectory: `docs/plans/<sub-project-name>/`
  - Inside: `SPEC.md`, `RESEARCH.md`, `STATUS.md`, `PHASE-*-PLAN.md`
  - Example: `docs/plans/rowl-memory-first/PHASE-1A-PLAN.md`
- **Living front door** is `docs/STATE.md` at the docs root (not in `plans/`). Every session-end and every phase transition updates it.

## Plan format

Plans are produced by the `superpowers:writing-plans` skill. They use TDD-style bite-sized tasks (2-5 minutes per step) with checkboxes for tracking progress. Every step has exact file paths and exact commands.

## Multi-initiative map

See `docs/STATE.md` for the current sub-project tracker.
```

- [ ] **Step 3: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add docs/plans/README.md && git commit -m "docs: add plans/ convention README"
```

---

### Task 14: Create `docs/STATE.md` living front door

**Files:**
- Create: `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`

- [ ] **Step 1: Create the STATE file**

Create `/Users/mauriello/Dev/rowl-v2/docs/STATE.md` with exactly this content:

```markdown
# Rowl — Current State (Plans Front Door)

**Last updated:** 2026-04-18 (sub-project #0 in progress)
**Current focus:** Sub-project #0 — Bootstrap (fork + rebrand + docs convention)

> **If you are a new session resuming Rowl work, read this file FIRST.**
> It orients you in ~60 seconds and tells you what to read next.

---

## Overall goal (immutable)

Rowl is a deliberate synthesis of four open-source reference projects. Each contributes a specific layer. Do NOT forget this — it is the whole reason for the multi-sub-project arc.

| Source repo | License | Contributes | Sub-project |
|-------------|---------|-------------|-------------|
| [craft-agents-oss](https://github.com/lukilabs/craft-agents-oss) | Apache-2.0 | **UI / Electron base + runtime** — sidebar, skills/MCP surface, Mac-native feel, agent backend seam, session model | base (#0) |
| [letta-code](https://github.com/letta-ai/letta-code) | MIT | **Memory-first agent architecture** — git-backed memory blocks, reminder engine, self-editing memory, Palace viewer | #1 |
| [paperclip](https://github.com/paperclipai/paperclip) | Apache-2.0 | **Organizing layer** — Goal → Issue → Document/Feedback/Approval model, goal ancestry | #2 |
| [t3code](https://github.com/pingdotgg/t3code) | MIT | **Niche features** — git-native turn checkpoints, worktrees, stacked PRs, composer draft persistence, context meter | #3 |

All four are license-compatible (MIT / Apache-2.0). Reference clones live at `/Users/mauriello/Dev/_reference/`.

**Rowl in one sentence:** memory-first agents inside the Craft Agents UI base, organized by Paperclip-style goal/issue/document structure, with t3code's niche engineering workflow features.

---

## Where we are right now

- **Sub-project:** #0 — Bootstrap
- **Phase:** in progress (plan being executed)
- **Plan:** `docs/plans/2026-04-18-subproject-0-bootstrap.md`
- **Branch:** main (no feature branch for bootstrap)
- **Blocker:** none

## Last session handoff

**Session end: 2026-04-18 (plan written, execution starting)**

- Confirmed base = craft-agents-oss fork (honors original intent of "use craft-agents UI as the base we put everything into"). NOT a continuation of the previous `/rowl/` t3code-fork direction.
- Old `/Users/mauriello/Dev/rowl/` repo frozen in place as donor/reference; no deletions done there.
- New codebase lives at `/Users/mauriello/Dev/rowl-v2/`.
- Product name: Rowl (unchanged). Internal workspace package names (`@craft-agent/*`) intentionally NOT renamed — minimal rebrand only.
- Memory-first (sub-project #1) will be re-planned fresh after bootstrap ships. Old `/rowl/` phase-1a code can be read as translation reference when the new plan is written; it will NOT be copied verbatim (Effect-TS → plain TS translation needed, and scope may shift).

**Next session resumes by:** continuing to execute `docs/plans/2026-04-18-subproject-0-bootstrap.md` task-by-task, then brainstorming sub-project #1 (memory port).

---

## Multi-initiative map

| # | Initiative | Status | Why this order |
|---|-----------|--------|----------------|
| 0 | Bootstrap (fork craft-agents → rebrand → docs convention) | in progress | Must establish the base before any features. |
| 1 | Memory-first agent (Letta pattern port) | not-started | Foundational. Every subsequent feature behaves differently with memory. |
| 2 | Organizing layer (Paperclip-style goals/issues/docs) | not-started | Gives "why are we doing this" structure on top of memory. |
| 3 | t3code cherry-picks (checkpoints, worktrees, stacked PRs) | not-started | High-value, self-contained adds. |
| 4 | Research/review UX polish | not-started | Surfaces #2's data model as real research workflow UI. |

## Reading order when you resume

**Every session start:**
1. This file (`docs/STATE.md`) — top section
2. Current sub-project's plan file (see "Where we are right now" above)
3. Relevant plan task in progress

**If zooming out:**
4. `docs/plans/README.md` — plan conventions
5. Other sub-projects' SPEC/RESEARCH/STATUS

## Reference material (external, read-only)

- `/Users/mauriello/Dev/_reference/craft-agents-oss/` — the base we forked from (Apache-2.0)
- `/Users/mauriello/Dev/_reference/letta-code/` — memory pattern reference for #1
- `/Users/mauriello/Dev/_reference/paperclip/` — organizing-layer reference for #2
- `/Users/mauriello/Dev/_reference/t3code/` — niche-features reference for #3
- `/Users/mauriello/Dev/rowl/` — old pre-pivot Rowl (t3code fork) — frozen; read-only donor for memory-port translation reference when sub-project #1 planning starts

## Locked decisions

- **2026-04-18** — Base = craft-agents-oss fork at `/Users/mauriello/Dev/rowl-v2/`. Confirmed user intent (prior direction dropped this).
- **2026-04-18** — Minimal rebrand only: root `package.json`, `README.md`, `NOTICE`, Electron bundle metadata. Internal `@craft-agent/*` workspace names NOT renamed.
- **2026-04-18** — Plans location = inside this repo at `docs/plans/`. Living front door = `docs/STATE.md`.
- **2026-04-18** — `/Users/mauriello/Dev/rowl/` (old repo) frozen, not deleted. Untouched.
- **2026-04-18** — Trademark compliance: Apache-2.0 NOTICE preserved + addendum; "Craft"/"Craft Agents" branding removed from user-visible surfaces (productName, appId, README title).

## Update discipline (non-negotiable)

Update this file whenever:
1. **Session end** — update "Last session handoff".
2. **Phase/sub-project transition** — update "Where we are right now" and the multi-initiative map.
3. **Architectural decision** — append to "Locked decisions" with date.
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add docs/STATE.md && git commit -m "docs: add STATE.md living front door for plans"
```

---

### Task 15: Move bootstrap plan into the repo

**Files:**
- Create: `/Users/mauriello/Dev/rowl-v2/docs/plans/2026-04-18-subproject-0-bootstrap.md`
- Delete (from filesystem): `/Users/mauriello/Dev/rowl-v2-subproject-0-plan.md` (the neutral-location copy)

- [ ] **Step 1: Copy the plan into the repo**

Run:
```bash
cp /Users/mauriello/Dev/rowl-v2-subproject-0-plan.md /Users/mauriello/Dev/rowl-v2/docs/plans/2026-04-18-subproject-0-bootstrap.md
```
Expected: no output.

- [ ] **Step 2: Verify the copy**

Run:
```bash
head -5 /Users/mauriello/Dev/rowl-v2/docs/plans/2026-04-18-subproject-0-bootstrap.md
```
Expected: shows "# Rowl-v2 Sub-project #0 — Bootstrap Implementation Plan".

- [ ] **Step 3: Remove the neutral-location copy**

Run:
```bash
rm /Users/mauriello/Dev/rowl-v2-subproject-0-plan.md
```
Expected: no output.

- [ ] **Step 4: Commit the plan into the repo**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add docs/plans/2026-04-18-subproject-0-bootstrap.md && git commit -m "docs(plans): add sub-project #0 bootstrap plan"
```

---

### Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck
```
Expected: exits 0.

- [ ] **Step 2: Comprehensive typecheck**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run typecheck:all
```
Expected: exits 0 (or same state as Task 5 Step 2 — rebrand shouldn't have changed typecheck outcome).

- [ ] **Step 3: Tests**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun test
```
Expected: exits 0 with same pass count as Task 6.

- [ ] **Step 4: Electron build**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:build
```
Expected: exits 0.

- [ ] **Step 5: Electron visual smoke**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && bun run electron:start
```
Expected: window opens. (macOS menu bar in dev mode may still say "Electron"; that's normal — packaged dist uses `productName` from electron-builder.yml.)

- [ ] **Step 6: Confirm git history is clean**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git log --oneline -15
```
Expected: you see the rebrand commits on top of the upstream commit from Task 1, with messages matching those authored in Tasks 8-15.

- [ ] **Step 7: Confirm no uncommitted changes**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git status
```
Expected: `nothing to commit, working tree clean`.

No commit for this task — it's verification.

---

### Task 17: Update STATE.md — sub-project #0 shipped

**Files:**
- Modify: `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`

- [ ] **Step 1: Update the "Last updated" line**

Edit `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`:

Old:
```
**Last updated:** 2026-04-18 (sub-project #0 in progress)
**Current focus:** Sub-project #0 — Bootstrap (fork + rebrand + docs convention)
```

New:
```
**Last updated:** 2026-04-18 (sub-project #0 shipped)
**Current focus:** Sub-project #1 — Memory-first agent (planning phase, not started)
```

- [ ] **Step 2: Update "Where we are right now"**

Edit `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`:

Old:
```
## Where we are right now

- **Sub-project:** #0 — Bootstrap
- **Phase:** in progress (plan being executed)
- **Plan:** `docs/plans/2026-04-18-subproject-0-bootstrap.md`
- **Branch:** main (no feature branch for bootstrap)
- **Blocker:** none
```

New:
```
## Where we are right now

- **Sub-project:** #1 — Memory-first agent (not started)
- **Phase:** pre-planning — need to brainstorm scope against craft-agents' session/agent model
- **Plan:** not written yet
- **Branch:** main
- **Blocker:** none. Next action: use `superpowers:brainstorming` skill to decompose sub-project #1 against the new codebase (craft-agents base, not the old t3code base). Then `superpowers:writing-plans` to produce the first phase plan.
```

- [ ] **Step 3: Update "Last session handoff"**

Edit `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`, replacing the entire "Last session handoff" block with:

```
## Last session handoff

**Session end: 2026-04-18 (sub-project #0 shipped)**

- Forked craft-agents-oss at its default branch into `/Users/mauriello/Dev/rowl-v2/`.
- Rebranded user-visible surfaces: root package.json, README top section, NOTICE addendum, Electron bundle identity (appId `dev.rowl.app`, productName `Rowl`).
- Internal `@craft-agent/*` workspace names intentionally left as-is.
- Established `docs/plans/` convention and `docs/STATE.md` as the living front door.
- Baseline green: `bun run typecheck`, `bun test`, `bun run electron:build`, and `bun run electron:start` all pass.
- No remote configured; no GitHub repo created yet.

**Next session resumes by:** invoke `superpowers:brainstorming` to scope sub-project #1 (memory-first port) against the craft-agents codebase. The prior `/Users/mauriello/Dev/rowl/` phase-1a memory code (branch `phase-1a/core-memory-substrate`, tag `v-phase-1a`) is a translation reference only — Effect-TS there vs plain TS here, and craft-agents has a different agent backend shape (`packages/shared/src/agent/backend/types.ts`), so the port will be a rewrite, not a copy.
```

- [ ] **Step 4: Update the multi-initiative map row for sub-project #0**

Edit `/Users/mauriello/Dev/rowl-v2/docs/STATE.md`:

Old:
```
| 0 | Bootstrap (fork craft-agents → rebrand → docs convention) | in progress | Must establish the base before any features. |
```

New:
```
| 0 | Bootstrap (fork craft-agents → rebrand → docs convention) | shipped | Must establish the base before any features. |
```

- [ ] **Step 5: Commit**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git add docs/STATE.md && git commit -m "docs(state): mark sub-project #0 shipped; next is memory-first brainstorming"
```

- [ ] **Step 6: Final git log check**

Run:
```bash
cd /Users/mauriello/Dev/rowl-v2 && git log --oneline -20
```
Expected: the rebrand + docs commits sit on top of the upstream history. The most recent commit is the STATE.md update from Step 5.

---

## Done criteria (plan complete when all true)

- [ ] `/Users/mauriello/Dev/rowl-v2/` exists as a git repo with no `origin` remote.
- [ ] `bun install && bun run typecheck && bun test && bun run electron:build && bun run electron:start` all succeed.
- [ ] `package.json` root name is `rowl`; `electron-builder.yml` has `appId: dev.rowl.app` and `productName: Rowl`.
- [ ] `NOTICE` contains both the upstream Craft Agents notice AND the Rowl fork addendum with the correct upstream SHA.
- [ ] `README.md` top section identifies the project as Rowl with a link and attribution to craft-agents-oss.
- [ ] `docs/plans/README.md` documents the plan convention.
- [ ] `docs/STATE.md` exists, is marked "sub-project #0 shipped", and points at sub-project #1 as the next focus.
- [ ] `docs/plans/2026-04-18-subproject-0-bootstrap.md` (this file) is committed inside the repo.
- [ ] `git status` shows a clean tree.
- [ ] The neutral-location copy at `/Users/mauriello/Dev/rowl-v2-subproject-0-plan.md` has been removed.

## Explicit non-goals (confirm NONE of these happened)

- [ ] No memory / CoreMemoryService code ported from `/rowl/`.
- [ ] No new provider adapters added or removed.
- [ ] No AgentBackend interface changes in `packages/shared/src/agent/backend/types.ts`.
- [ ] No workspace package names renamed (everything still `@craft-agent/*` internally).
- [ ] No GitHub remote created, no CI workflows added.
- [ ] No UI changes — the Electron window still renders the upstream craft-agents-oss interface.
- [ ] `/Users/mauriello/Dev/rowl/` (old repo) is untouched — `git log -1` there still matches what it was before this plan ran.
