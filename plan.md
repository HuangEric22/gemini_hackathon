# Eval Harness — Completion Plan

The graders, fixture layer, and production hook seam are **built** (see `eval/IMPLEMENTATION.md` for a full walkthrough of everything implemented so far, including deviations from the original design). This plan covers only what remains to make the harness actually runnable end-to-end: the dataset, the runner, reporting, the CLI, wiring, and verification.

## Status

| Piece | State |
|---|---|
| `src/lib/eval-hooks.ts` (hook seam) + 4 prod-file integrations | ✅ done |
| `eval/harness/types.ts`, `time-utils.ts`, `fixtures.ts` | ✅ done |
| `eval/graders/phase1-tool-calls.ts`, `phase2-hard-checks.ts`, `phase2-llm-judge.ts` | ✅ done |
| `eval/datasets/scenarios.json` (9 scenarios) | ⬜ step 1 |
| `eval/harness/runner.ts` (per-scenario driver) | ⬜ step 2 |
| `eval/harness/report.ts` (scorecard / raw / diff) | ⬜ step 3 |
| `eval/harness/run.ts` (CLI entrypoint) | ⬜ step 4 |
| `package.json` script, `.gitignore` entries | ⬜ step 5 |
| Verification (typecheck → offline run → record → replay) | ⬜ step 6 |

Established facts the steps below rely on:

- `generateItineraryAction(input): Promise<ItineraryGenerationResponse>` imports no auth/headers/DB — only `@google/genai`, the planning phase, and the route-matrix action — so it is callable from `tsx` outside Next.js. The `'use server'` directive is an inert string literal there.
- It reads `process.env.GEMINI_API_KEY` and throws if missing.
- `tsx` and `dotenv` are already installed.

---

## Step 1 — Generate `eval/datasets/scenarios.json`

Run the prepared generator script (session scratchpad, `build-scenarios.ts`) once and commit only the emitted JSON. The script exists because per-venue `OpeningPeriod` arrays are too repetitive to hand-write; it uses an `hours(days, openH, openM, closeH, closeM)` helper and real coordinates.

The 9 scenarios (original 8 + `sf-feedback`, added so the judge's `feedback_recovery` criterion has coverage):

| id | Covers |
|---|---|
| `sf-baseline` | hotel-anchor logic, moderate pace, closed-day museums |
| `yosemite-hike` | required `estimate_hike_duration` call; hike ≥ 300 min |
| `tokyo-meals` | meal balance + ≥ 2 `alternative` items |
| `iceland-clusters` | geographic clustering across ~370 km |
| `paris-closed-days` | opening-hours enforcement |
| `nyc-day-assignments` | pinned `dayAssignments` respected |
| `sf-packed-luxury` | `pace` / `budget` / `startTime` knobs |
| `rome-gap-fill` | ≥ 4 AI-suggested items from 1 selected activity |
| `sf-feedback` | `currentItinerary` + `preference` refinement |

Acceptance: the file typechecks as `EvalScenario[]` (add a tiny `import scenarios from …; const _check: EvalScenario[] = scenarios` assertion in the runner, or a `satisfies` cast in a loader), and every scenario requires `get_weather_forecast` in Phase 1 (the planning prompt mandates it unconditionally).

## Step 2 — `eval/harness/runner.ts` (per-scenario driver)

One exported function:

```ts
export async function runScenario(
  scenario: EvalScenario,
  opts: { mode: 'record' | 'replay'; judge: boolean; apiKey: string; timeoutMs?: number },
): Promise<ScenarioResult>
```

Flow (all building blocks already exist):

1. `const trace: ToolTraceEntry[] = []; const state: PlanningState = { rounds: 0, lastRoundToolCalls: 0 };`
2. `const { hooks, getRecordedFixture } = createScenarioHooks({ scenarioId, mode, trace, state });`
3. `setEvalHooks(hooks)` → call `generateItineraryAction(scenario.input)` raced against a timeout (default **240 s**; generation legitimately takes minutes with retries) → **`clearEvalHooks()` in a `finally`** so a crashed scenario can't leak hooks into the next one.
4. On generation error/timeout: return a `ScenarioResult` with `error` set, `itinerary: null`, empty phase2/judge arrays — but still include the tool trace and run `gradePhase1` (a Phase-1 trace exists even when Phase 2 dies, and it's diagnostic gold).
5. On success in record mode: `saveFixture(getRecordedFixture())` — only after success, so half-recorded fixtures are never committed.
6. Grade: `phase1 = gradePhase1(scenario, trace, state)`; `phase2 = gradePhase2(scenario, itinerary)`; `judge = opts.judge ? await runJudge(scenario, itinerary, apiKey) : []`.
7. Fill `planningRounds` / `lastRoundToolCalls` from `state`, record `startedAt` / `durationMs`, return.

Scenarios run **sequentially** (parallel runs would trample the global hook registry — one registry, one scenario at a time — and would hammer Gemini rate limits).

Timeout mechanics: `Promise.race` with a timer is enough; we can't cancel the underlying call, but `clearEvalHooks()` + process exit at the end of the run makes that harmless. Don't reuse the timed-out scenario's trace array afterward.

## Step 3 — `eval/harness/report.ts`

Three writers into `eval/results/<ISO-timestamp>/` (colons stripped for Windows paths):

- **`raw.json`** — the full `RunOutput`, pretty-printed. This is the machine-diffable artifact and the input to `--regrade`.
- **`scorecard.md`** — one table: scenario × (error?, phase-1 fails, phase-2 fails, judge scores). Emoji status per cell (✅/❌/⏭️), judge scores as `criterion: n/5`. Below the table, a **failures section** that prints every failing check's `details` string verbatim — the graders were written so failures self-explain; the scorecard's job is just to surface them. Also render each trace entry's `source` mix (e.g. `fixture ×6, synthetic ×2, pure ×3`) per scenario so it's visible when replay silently fell back to synthetic.
- **`diff.md`** — compare against the **latest previous** directory in `eval/results/` (lexicographic max, skipping the current one). List: checks that went pass→fail (regressions, listed first), fail→pass (fixes), judge deltas with |Δ| ≥ 1, and scenarios that newly error/timeout. If no previous run exists, write "first run — nothing to diff".

Helper: `deterministicFailures()` from `types.ts` already exists for the exit-code decision.

## Step 4 — `eval/harness/run.ts` (CLI entrypoint)

```
npm run eval                                # replay run, judged
npm run eval -- --scenario yosemite-hike    # one scenario (id or unique prefix)
npm run eval -- --record                    # live APIs, saves fixtures
npm run eval -- --no-judge                  # skip LLM judge (fast iteration)
npm run eval -- --regrade <results-dir>     # re-run graders + judge over a saved raw.json, no generation
```

Behavior:

1. `dotenv.config({ path: '.env.local' })` first; fail fast with a clear message if `GEMINI_API_KEY` is missing (per the confirmed decision — the harness never falls back to shell env silently, though `process.env` already being set is fine).
2. Parse flags by hand (`process.argv.slice(2)`) — no new dependency for 4 flags.
3. Load + filter scenarios, run sequentially via `runScenario`, print one progress line per scenario (`id … 87s, 2 fails, judge 4/4/3`).
4. `--regrade`: read the old `raw.json`, re-run `gradePhase2` + `runJudge` on each stored itinerary (Phase-1 checks are copied over unchanged — the trace can't be regenerated without a live model call). Judge caching makes regrades of unchanged itineraries free; this is the cheap path for iterating on grader logic.
5. Write reports (step 3), then `process.exit(1)` if any scenario has `error` set or any deterministic check failed; `0` otherwise. Judge scores never affect the exit code (they're signals, not gates).

## Step 5 — Wiring

- `package.json` scripts: `"eval": "tsx eval/harness/run.ts"`.
- `.gitignore`: add `eval/results/` and `eval/.cache/`.
- Commit `eval/datasets/fixtures/` (fixtures are meant to be shared).
- Fix any `tsconfig` friction: `tsx` resolves the `@/*` path alias from `tsconfig.json`; if the eval files fall outside `include`, extend `include` (or add `eval/tsconfig.json` extending the root) so both `tsx` and `tsc --noEmit` see them.

## Step 6 — Verification (in order, cheapest first)

1. `npx tsc --noEmit` — the whole harness + dataset typechecks.
2. **Offline-ish smoke**: `npm run eval -- --scenario rome-gap-fill --no-judge` *before recording any fixtures*. Replay mode with no fixtures serves synthetic responses, so this proves the full loop (hooks → generation → trace → graders → report) with only the Gemini calls being live (a few cents). Expect trace `source` to be all `synthetic`/`pure`.
3. **Record**: `npm run eval -- --record --no-judge` for all 9 scenarios; commit fixtures. Watch for `loop_bound` failures — record mode is where a stuck planning loop would first show up.
4. **Replay + judge**: full `npm run eval`; confirm trace sources are now mostly `fixture`, judge cache directory populates, and re-running immediately costs zero judge calls (all `cached: true`).
5. Eyeball `scorecard.md` on the current generator: iterate on any check that fails for grader-bug reasons (vs. real generator bugs) before treating the suite as a baseline.

## API-cost strategy (final)

Levers already implemented, plus what the runner adds:

| Lever | Effect |
|---|---|
| Replay mode default; fixtures + synthetic fallbacks | Zero Google Maps / Open-Meteo calls after (or even before) recording |
| Pure tools always run locally | No fixtures or cost for the two estimator tools |
| Judge cache keyed on (prompt version, model, criterion, scenario, itinerary) | Re-judging unchanged output is free; `--regrade` is ~free |
| `--no-judge` | Iteration runs cost only generation |
| `EVAL_JUDGE_MODEL=gemini-2.5-flash` | Cheap rubric iteration |
| Judge fallback to flash on 429/503, `score: 0` sentinel on hard failure | A rate-limited judge degrades instead of wasting the run |
| Sequential execution | Stays under rate limits; no burst retries |

Expected per full run (9 scenarios): Phase 1 ≤ 6 Gemini rounds each + 1 Phase-2 call each (this is the thing under test — irreducible); judge ≤ 28 calls on first run, ~0 on reruns. Order of magnitude: tens of cents per fresh judged run, single-digit cents with `--no-judge`.

## Definition of "functional"

- [ ] `npm run eval` completes on all 9 scenarios and writes `scorecard.md`, `raw.json`, `diff.md`.
- [ ] Exit code reflects deterministic failures only.
- [ ] Killing the run mid-scenario leaves no hooks registered on the next run (fresh process) and no partial fixture files.
- [ ] `npm run eval` twice in a row: second run's judge calls are all cache hits.
- [ ] `--scenario`, `--record`, `--no-judge`, `--regrade` all work as specced.
- [ ] `tsc --noEmit` clean.

## Risks

- **`tsx` + `@/` alias resolution** — verified pattern but check first; fallback is `tsx --tsconfig tsconfig.json` or relative imports inside `eval/`.
- **Live Gemini nondeterminism** — Phase 1/2 are intentionally live, so deterministic *checks* can still flap if the generator is genuinely borderline (that's signal, not noise; the ±1 pace grace and fuzzy fixture matching already absorb the benign variance).
- **Model list drift** — `MODELS` / `PLANNING_MODELS` fallbacks mean a run may be graded against different underlying models between runs; `raw.json` doesn't currently capture which model served Phase 2. Acceptable for v1; note it in the scorecard header if it becomes confusing.

Out of scope (unchanged from the original plan): UI eval, `regenerate-day`, CI hookup (optional follow-up: GitHub Action running `--no-judge` on PRs touching `src/lib/gemini-*` or the generate action, commenting `diff.md`).
