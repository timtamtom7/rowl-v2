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
