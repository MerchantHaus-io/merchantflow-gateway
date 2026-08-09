---
description: Run one phase of the Ops Terminal remediation as a Gauntlet Loop
argument-hint: <phase-id, e.g. phase-3a>
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
model: opus
---

# Gauntlet Loop — $ARGUMENTS

Brief: @docs/gauntlet/$ARGUMENTS.md
Project invariants: @CLAUDE.md
Current branch: !`git branch --show-current`
Working tree: !`git status --short`

## Execute

1. **Recon.** Fan out one `gauntlet-scout` per item in the brief, in parallel.
   Each scout gets the item text inline — subagents receive nothing but the
   prompt string, so paste the item, do not reference it.

2. **Report before building.** Give me the combined scout output and your
   proposed order. Wait for my go. If any scout says ALREADY SATISFIED, drop
   that item.

3. **Build.** One `gauntlet-builder` per item. Run them in parallel ONLY where
   the scouts showed no file overlap. Where two items touch the same file,
   serialize them — parallel agents editing one file will clobber each other.

4. **Gauntlet.** For each completed item, spawn a `gauntlet-critic` with the
   item's gate from the brief pasted inline. The critic must not run in the
   builder's context.

5. **Loop.** Every FAIL goes back to a fresh `gauntlet-builder` with the
   critic's reason. Maximum 3 rounds per item. On a third FAIL, stop and
   report what is blocking it — do not keep looping.

6. **Close.** When every item is PASS, run the smoke test in
   @docs/gauntlet/smoke.md, then commit with tag `gauntlet/$ARGUMENTS`.

Do not proceed past a FAIL. Do not fix anything outside the brief.

## Before step 1, check the brief is runnable

Each brief carries a **Gate status** table marking every gate as EXECUTABLE or
NOT EXECUTABLE. If an item's gate is NOT EXECUTABLE, say so at step 2 and let
me decide whether to run it with me as the critic, or defer it. Do not send an
item to a builder when nothing can prove it done — that is how a phase reports
green with nothing verified.

Phases whose gates are mostly visual (7, and the comparison halves of 1, 4, 5)
need me in the critic seat until Playwright is installed. Say so rather than
letting the critic reason about pixels it cannot see.
