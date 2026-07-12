/**
 * CLI entrypoint — `npm run eval`.
 *
 *   npm run eval                                # replay run, judged
 *   npm run eval -- --scenario yosemite-hike    # one scenario (id or unique prefix)
 *   npm run eval -- --record                    # live APIs, saves fixtures
 *   npm run eval -- --no-judge                  # skip the LLM judge
 *   npm run eval -- --regrade <results-dir>     # re-grade a saved raw.json, no generation
 *
 * Exit code: 1 if any scenario errored or any deterministic check failed;
 * judge scores never gate.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { runScenario } from './runner';
import { writeReports, RESULTS_DIR } from './report';
import { gradePhase2 } from '../graders/phase2-hard-checks';
import { runJudge } from '../graders/phase2-llm-judge';
import { deterministicFailures } from './types';
import type { EvalScenario, RunOutput, ScenarioResult } from './types';

const SCENARIOS_PATH = path.join(process.cwd(), 'eval', 'datasets', 'scenarios.json');

interface CliArgs {
  scenario?: string;
  record: boolean;
  judge: boolean;
  regrade?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { record: false, judge: true };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--scenario':
        args.scenario = argv[++i];
        if (!args.scenario) fail('--scenario requires an id');
        break;
      case '--record':
        args.record = true;
        break;
      case '--no-judge':
        args.judge = false;
        break;
      case '--regrade':
        args.regrade = argv[++i];
        if (!args.regrade) fail('--regrade requires a results directory');
        break;
      default:
        fail(`unknown flag: ${argv[i]}`);
    }
  }
  return args;
}

function fail(msg: string): never {
  console.error(`eval: ${msg}`);
  process.exit(1);
}

function loadScenarios(filter?: string): EvalScenario[] {
  // The dataset is emitted by a typed generator; the cast here is a
  // deliberate runtime boundary (JSON literal types can't carry the unions).
  const all = JSON.parse(fs.readFileSync(SCENARIOS_PATH, 'utf-8')) as EvalScenario[];
  if (!filter) return all;
  const matches = all.filter(s => s.id === filter);
  const byPrefix = matches.length > 0 ? matches : all.filter(s => s.id.startsWith(filter));
  if (byPrefix.length === 0) fail(`no scenario matches "${filter}" (have: ${all.map(s => s.id).join(', ')})`);
  if (byPrefix.length > 1) fail(`"${filter}" is ambiguous: ${byPrefix.map(s => s.id).join(', ')}`);
  return byPrefix;
}

function summarize(r: ScenarioResult): string {
  const fails = deterministicFailures(r).length;
  const judge = r.judge.length > 0 ? ` · judge ${r.judge.map(j => j.score).join('/')}` : '';
  const gen = r.error ? `ERROR (${r.error})` : `${Math.round(r.durationMs / 1000)}s`;
  return `${gen} · ${fails} deterministic fail(s)${judge}`;
}

async function regrade(dir: string, judge: boolean, apiKey: string): Promise<RunOutput> {
  const rawPath = path.isAbsolute(dir)
    ? path.join(dir, 'raw.json')
    : path.join(RESULTS_DIR, path.basename(dir), 'raw.json');
  if (!fs.existsSync(rawPath)) fail(`no raw.json at ${rawPath}`);
  const old = JSON.parse(fs.readFileSync(rawPath, 'utf-8')) as RunOutput;
  const scenarios = loadScenarios();

  const results: ScenarioResult[] = [];
  for (const r of old.results) {
    const scenario = scenarios.find(s => s.id === r.scenarioId);
    if (!scenario || !r.itinerary) {
      results.push(r); // nothing to re-grade; carry over as-is
      continue;
    }
    console.log(`re-grading ${r.scenarioId} …`);
    results.push({
      ...r,
      // Phase-1 checks are copied over unchanged: the trace can't be
      // regenerated without a live model call.
      phase2: gradePhase2(scenario, r.itinerary),
      judge: judge ? await runJudge(scenario, r.itinerary, apiKey) : r.judge,
    });
  }
  return { runAt: new Date().toISOString(), mode: 'regrade', judged: judge, results };
}

async function main(): Promise<void> {
  dotenv.config({ path: '.env.local' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail('GEMINI_API_KEY is not set — add it to .env.local');

  const args = parseArgs(process.argv.slice(2));

  let run: RunOutput;
  if (args.regrade) {
    run = await regrade(args.regrade, args.judge, apiKey);
  } else {
    const scenarios = loadScenarios(args.scenario);
    const mode = args.record ? 'record' : 'replay';
    console.log(`Running ${scenarios.length} scenario(s) in ${mode} mode, judge ${args.judge ? 'on' : 'off'}\n`);
    const results: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      process.stdout.write(`▶ ${scenario.id} … `);
      const result = await runScenario(scenario, { mode, judge: args.judge, apiKey });
      console.log(summarize(result));
      results.push(result);
    }
    run = { runAt: new Date().toISOString(), mode, judged: args.judge, results };
  }

  const dir = writeReports(run);
  console.log(`\nReports written to ${path.relative(process.cwd(), dir)}`);

  const bad = run.results.filter(r => r.error || deterministicFailures(r).length > 0);
  if (bad.length > 0) {
    console.error(`\n${bad.length} scenario(s) with errors or deterministic failures — see scorecard.md`);
    process.exit(1);
  }
  console.log('\nAll deterministic checks passed.');
}

main().catch(err => {
  console.error('eval: unhandled error:', err);
  process.exit(1);
});
