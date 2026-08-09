# The Gauntlet Loop

Nine phases from the Ops Terminal execution plan, rewritten against what the
repo **actually contains** as of 8 Aug 2026 rather than what the plan assumed.

Run one phase per session:

```
/gauntlet phase-2
```

That fans out `gauntlet-scout` per item, reports back, waits for your go, then
builds and runs each item through `gauntlet-critic` until it passes or hits
the 3-round ceiling.

---

## Read this before running anything

The plan was written **before** three PRs (#101, #102, #103) landed. Recon
across all nine phases — 13 agents, four of them adversarial verifiers
attacking the DONE claims — found the plan is substantially stale. Every one
of the four challenges **upheld** the recon.

| Phase | Real state |
|---|---|
| 0 Safety net | **Half done.** Backups are a live hourly cron. Telemetry exists but isn't Sentry. |
| 1 Subtraction | **Barely started.** #114 done, #59 done, #140 done. The decorative deletions are all outstanding. |
| 2 Merchant wiring | **Not started.** Highest value in the document. |
| 3 Security | **Mostly done**, but 3A's foundation exists in a different shape than the plan describes. |
| 4 Chrome | **Done.** All items verified and adversarially upheld. |
| 5 Mobile | **5A/5B done.** 5C partial. |
| 6 Scale | **Not started.** Confirmed: the list page pulls up to 5,000 rows client-side. |
| 7 Design system | **Mostly done.** Two concrete gaps left. |
| 8 Business loops | **Not started**, except a partial 8.1. |

**Phase 4 needs no session at all.** Phase 5 needs only 5C. Start at Phase 2
if you want value, or Phase 1 if you want every later phase to be cheaper.

## The decisions are answered

`decisions.md` has all nine, with D9 settled from the repo rather than
guessed. Several change the work:

- **D2** kills the office chat (~5,200 lines) and promotes the **notice board**
  to the team's real comms surface.
- **D6** says mobile is the *primary* surface, which moves #151 and #152 up.
- **D8** cuts themes 14 → 4, not 14 → 2.
- **D9**: `public/sw.js` is push-only, caches nothing, is registered at
  `usePushNotifications.ts:50`. Leave it.

## Gate status — the honest version

Every brief marks each gate `EXECUTABLE` or `NOT EXECUTABLE`. That distinction
is the whole point: a critic that reasons about pixels it cannot see will
converge on PASS, and you will ship on its word.

**Playwright is installed** — `.mcp.json`, project scope, so it is shared with
the repo. Chromium is pre-installed in the remote environment; never run
`playwright install`. That makes the visual half of the harness real:
screenshots, frame times, device emulation and blind side-by-side comparison
all now execute.

`.mcp.json` deliberately carries an empty `env`. The remote container sets
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, which the server inherits;
hardcoding that path would break the config on a laptop, where Playwright's
default location is correct.

**Still not executable, whatever tooling you add:**

- **A real device.** Emulation does not catch the double safe-area inset
  (#151) or the hardware back button. Put a phone in your hand.
- **Google sign-in.** OAuth in automation is not worth the fight, so the
  signed-in smoke paths stay manual. The `/q/:token` path and the public
  support form *are* automatable and are the ones worth scripting first.
- **A test inbox.** Phase 2A's confirmation email and its PDF attachment.
- **Business truth.** Phase 8.1's "surface a genuine variance from last
  quarter's real statements" is a judgement, not a command.
- **Feature freeze (0.4).** A process policy — git cannot prove it. The
  observable signal is that unrelated feature commits kept landing on `main`
  after the audits merged, so it is not currently in force.

For those, **take the critic seat yourself.** `/gauntlet` flags them at step 2.

## After adding or changing an MCP server

Restart the session. MCP servers and `.claude/agents/` both load at startup,
so a server added mid-session is configured but not connected.

## Files

| File | What it is |
|---|---|
| `decisions.md` | D1–D9, answered |
| `smoke.md` | The three-path check, run after every session |
| `found.md` | Where builders log what they found but didn't fix |
| `phase-N.md` | One brief per phase: items, current status, gates |

Agents live in `.claude/agents/`, the orchestrator in
`.claude/commands/gauntlet.md`, and the non-negotiables in `CLAUDE.md`.
