/**
 * Report writers: eval/results/<run-dir>/{raw.json, scorecard.md, diff.md}.
 *
 * raw.json is the machine-diffable artifact (and the input to --regrade);
 * scorecard.md surfaces every failing check's details verbatim — the graders
 * were written so failures self-explain; diff.md compares against the most
 * recent previous run, regressions first.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CheckResult, RunOutput, ScenarioResult } from './types';
import { deterministicFailures } from './types';

export const RESULTS_DIR = path.join(process.cwd(), 'eval', 'results');

/** ISO timestamp with characters Windows paths can't hold stripped. */
export function newRunDir(runAt: string): string {
  const dir = path.join(RESULTS_DIR, runAt.replace(/:/g, '-').replace(/\..+$/, 'Z'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statusIcon(s: CheckResult['status']): string {
  return s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⏭️';
}

function failCount(checks: CheckResult[]): string {
  const fails = checks.filter(c => c.status === 'fail').length;
  const run = checks.filter(c => c.status !== 'skip').length;
  return fails === 0 ? `✅ ${run} ok` : `❌ ${fails}/${run}`;
}

function sourceMix(r: ScenarioResult): string {
  const counts = new Map<string, number>();
  for (const t of r.toolTrace) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
  return [...counts.entries()].map(([s, n]) => `${s} ×${n}`).join(', ') || '—';
}

function judgeCell(r: ScenarioResult): string {
  if (r.judge.length === 0) return '—';
  return r.judge.map(j => `${j.criterion.replace(/_/g, ' ')}: ${j.score}/5${j.cached ? '*' : ''}`).join('<br>');
}

// ---------------------------------------------------------------------------
// scorecard.md
// ---------------------------------------------------------------------------

export function renderScorecard(run: RunOutput): string {
  const lines: string[] = [];
  lines.push(`# Eval scorecard — ${run.runAt}`);
  lines.push('');
  lines.push(`Mode: **${run.mode}** · Judge: **${run.judged ? 'on' : 'off'}** (\`*\` = cached score)`);
  lines.push('');
  lines.push('| Scenario | Generation | Phase 1 | Phase 2 | Judge | Rounds | Trace sources |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of run.results) {
    const gen = r.error ? `❌ ${Math.round(r.durationMs / 1000)}s` : `✅ ${Math.round(r.durationMs / 1000)}s`;
    lines.push(
      `| ${r.scenarioId} | ${gen} | ${failCount(r.phase1)} | ${r.itinerary ? failCount(r.phase2) : '—'} | ${judgeCell(r)} | ${r.planningRounds} | ${sourceMix(r)} |`,
    );
  }

  const broken = run.results.filter(r => r.error || deterministicFailures(r).length > 0);
  if (broken.length === 0) {
    lines.push('', 'All deterministic checks passed. 🎉');
  } else {
    lines.push('', '## Failures', '');
    for (const r of broken) {
      lines.push(`### ${r.scenarioId} — ${r.title}`, '');
      if (r.error) lines.push(`- 💥 generation error: ${r.error}`);
      for (const c of deterministicFailures(r)) {
        lines.push(`- ${statusIcon(c.status)} \`${c.name}\`: ${c.details}`);
      }
      lines.push('');
    }
  }

  const judged = run.results.flatMap(r => r.judge).filter(j => j.score > 0);
  if (judged.length > 0) {
    lines.push('## Judge justifications', '');
    for (const r of run.results) {
      for (const j of r.judge) {
        lines.push(`- **${r.scenarioId} / ${j.criterion}** (${j.score}/5, ${j.model}${j.cached ? ', cached' : ''}): ${j.justification}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// diff.md
// ---------------------------------------------------------------------------

export function findPreviousRun(currentDir: string): RunOutput | null {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const dirs = fs
    .readdirSync(RESULTS_DIR)
    .filter(d => d !== path.basename(currentDir))
    .filter(d => fs.existsSync(path.join(RESULTS_DIR, d, 'raw.json')))
    .sort();
  const prev = dirs[dirs.length - 1];
  if (!prev) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, prev, 'raw.json'), 'utf-8')) as RunOutput;
  } catch {
    return null;
  }
}

type CheckMap = Map<string, CheckResult['status']>;

function checkMap(r: ScenarioResult): CheckMap {
  const m: CheckMap = new Map();
  for (const c of [...r.phase1, ...r.phase2]) m.set(c.name, c.status);
  return m;
}

export function renderDiff(run: RunOutput, prev: RunOutput | null): string {
  if (!prev) return '# Diff\n\nFirst run — nothing to diff.\n';

  const lines: string[] = [`# Diff vs run ${prev.runAt}`, ''];
  const regressions: string[] = [];
  const fixes: string[] = [];
  const judgeDeltas: string[] = [];
  const genChanges: string[] = [];

  for (const r of run.results) {
    const p = prev.results.find(x => x.scenarioId === r.scenarioId);
    if (!p) {
      genChanges.push(`- ${r.scenarioId}: new scenario`);
      continue;
    }
    if (!!r.error !== !!p.error) {
      genChanges.push(
        r.error
          ? `- ${r.scenarioId}: generation now FAILS (${r.error})`
          : `- ${r.scenarioId}: generation fixed (was: ${p.error})`,
      );
    }
    const cur = checkMap(r);
    const old = checkMap(p);
    for (const [name, status] of cur) {
      const before = old.get(name);
      if (before === undefined || before === status) continue;
      if (status === 'fail') regressions.push(`- ${r.scenarioId} \`${name}\`: ${before} → **fail**`);
      else if (before === 'fail') fixes.push(`- ${r.scenarioId} \`${name}\`: fail → **${status}**`);
    }
    for (const j of r.judge) {
      const pj = p.judge.find(x => x.criterion === j.criterion);
      if (!pj || j.score === 0 || pj.score === 0) continue;
      const delta = j.score - pj.score;
      if (Math.abs(delta) >= 1) {
        judgeDeltas.push(`- ${r.scenarioId} \`${j.criterion}\`: ${pj.score} → ${j.score} (${delta > 0 ? '+' : ''}${delta})`);
      }
    }
  }

  const section = (title: string, items: string[]) => {
    lines.push(`## ${title}`, '');
    lines.push(items.length > 0 ? items.join('\n') : '_none_');
    lines.push('');
  };
  section('Regressions (pass/skip → fail)', regressions);
  section('Fixes (fail → pass/skip)', fixes);
  section('Judge deltas (|Δ| ≥ 1)', judgeDeltas);
  section('Generation changes', genChanges);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------

export function writeReports(run: RunOutput): string {
  const dir = newRunDir(run.runAt);
  fs.writeFileSync(path.join(dir, 'raw.json'), JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(dir, 'scorecard.md'), renderScorecard(run));
  fs.writeFileSync(path.join(dir, 'diff.md'), renderDiff(run, findPreviousRun(dir)));
  return dir;
}
