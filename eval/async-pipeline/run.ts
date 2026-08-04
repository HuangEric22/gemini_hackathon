import fs from 'node:fs';
import path from 'node:path';
import {
  createSimulatedGenerator,
  InMemoryJobPipeline,
  runSyncWorkload,
  type BenchmarkObservation,
  type Workload,
} from './pipeline';
import { formatMs, formatPercent, summarizeLatency } from './metrics';

const DEFAULT_DURATIONS_MS = [100, 300, 600];
const DEFAULT_RUNS = 10;
const DEFAULT_FAILURE_RUNS = 100;
const DEFAULT_FAILURE_CONCURRENCY = 20;
const FAILURE_DURATION_MS = 20;
const TRANSIENT_FAILURE_MODES = ['timeout', 'rate-limit', 'server-error'] as const;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('Expected a positive integer');
  return parsed;
}

function buildWorkloads(runs: number) {
  return DEFAULT_DURATIONS_MS.flatMap(durationMs =>
    Array.from({ length: runs }, (_, index): Workload => ({
      id: `normal-${durationMs}-${index + 1}`,
      durationMs,
      failureMode: 'none',
    })),
  );
}

function summarize(observations: BenchmarkObservation[]) {
  const successful = observations.filter(item => item.status === 'succeeded');
  const retryEligible = observations.filter(item => item.failureMode !== 'none' && item.failureMode !== 'permanent');
  const failureModeCounts = Object.fromEntries(
    TRANSIENT_FAILURE_MODES.map(mode => [mode, observations.filter(item => item.failureMode === mode).length]),
  );
  return {
    runs: observations.length,
    acknowledgementMs: summarizeLatency(observations.map(item => item.acknowledgementMs)),
    completionMs: summarizeLatency(observations.map(item => item.completionMs)),
    completionRate: successful.length / Math.max(1, observations.length),
    retryRecoveryRate: retryEligible.filter(item => item.recovered).length / Math.max(1, retryEligible.length),
    failureModeCounts,
  };
}

async function submitConcurrently(
  pipeline: InMemoryJobPipeline,
  workloads: Workload[],
  concurrency: number,
) {
  const observations: BenchmarkObservation[] = [];
  for (let index = 0; index < workloads.length; index += concurrency) {
    const batch = workloads.slice(index, index + concurrency);
    observations.push(...await Promise.all(batch.map(workload => pipeline.submit(workload))));
  }
  return observations;
}

function report(
  sync: ReturnType<typeof summarize>,
  asyncSummary: ReturnType<typeof summarize>,
  failures: ReturnType<typeof summarize>,
  runsPerWorkload: number,
) {
  return `# Synthetic sync vs. async generation benchmark

> This deterministic local benchmark validates application queue behavior. It does not measure Gemini, Inngest network latency, production throughput, or itinerary quality.

## Normal workloads

| Metric | Synchronous | Queued async |
|---|---:|---:|
| Runs | ${sync.runs} | ${asyncSummary.runs} |
| Acknowledgement p50 | ${formatMs(sync.acknowledgementMs.p50)} | ${formatMs(asyncSummary.acknowledgementMs.p50)} |
| Acknowledgement p95 | ${formatMs(sync.acknowledgementMs.p95)} | ${formatMs(asyncSummary.acknowledgementMs.p95)} |
| Completion p50 | ${formatMs(sync.completionMs.p50)} | ${formatMs(asyncSummary.completionMs.p50)} |
| Completion p95 | ${formatMs(sync.completionMs.p95)} | ${formatMs(asyncSummary.completionMs.p95)} |
| Completion rate | ${formatPercent(sync.completionRate)} | ${formatPercent(asyncSummary.completionRate)} |

## Async transient-failure recovery

| Metric | Result |
|---|---:|
| Runs | ${failures.runs} |
| Acknowledgement p95 | ${formatMs(failures.acknowledgementMs.p95)} |
| Completion rate | ${formatPercent(failures.completionRate)} |
| Retry recovery rate | ${formatPercent(failures.retryRecoveryRate)} |
| Completion p95 | ${formatMs(failures.completionMs.p95)} |
| Timeout jobs | ${failures.failureModeCounts.timeout} |
| Rate-limit jobs | ${failures.failureModeCounts['rate-limit']} |
| Server-error jobs | ${failures.failureModeCounts['server-error']} |

## Configuration

- Workloads: ${DEFAULT_DURATIONS_MS.join(', ')} ms simulated generation
- Runs per workload and strategy: ${runsPerWorkload}
- Transient-failure runs: ${DEFAULT_FAILURE_RUNS}; evenly mixed timeouts, rate limits, and server errors
- Concurrent failure submissions: ${DEFAULT_FAILURE_CONCURRENCY}
- Failure workload duration: ${FAILURE_DURATION_MS} ms per attempt; every job fails once, then succeeds
- Maximum attempts: 3
- Poll interval: 10 ms; completion latency uses the persisted completion timestamp
- Normal workloads: sequential submissions
- Failure workloads: batches of ${DEFAULT_FAILURE_CONCURRENCY} concurrent submissions into a FIFO worker
`;
}

async function main() {
  const runs = parsePositiveInteger(argument('--runs'), DEFAULT_RUNS);
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputRoot = argument('--output') ?? path.join('eval', 'results', 'async-pipeline');
  const outputDirectory = path.resolve(outputRoot, runId);
  const normalWorkloads = buildWorkloads(runs);
  const failureWorkloads = Array.from({ length: DEFAULT_FAILURE_RUNS }, (_, index): Workload => ({
    id: `${TRANSIENT_FAILURE_MODES[index % TRANSIENT_FAILURE_MODES.length]}-${index + 1}`,
    durationMs: FAILURE_DURATION_MS,
    failureMode: TRANSIENT_FAILURE_MODES[index % TRANSIENT_FAILURE_MODES.length],
  }));
  const allWorkloads = new Map([...normalWorkloads, ...failureWorkloads].map(item => [item.id, item]));

  const syncGenerator = createSimulatedGenerator(allWorkloads);
  const syncObservations: BenchmarkObservation[] = [];
  for (const workload of normalWorkloads) syncObservations.push(await runSyncWorkload(workload, syncGenerator));

  const asyncGenerator = createSimulatedGenerator(allWorkloads);
  const pipeline = new InMemoryJobPipeline(asyncGenerator);
  const asyncObservations: BenchmarkObservation[] = [];
  for (const workload of normalWorkloads) asyncObservations.push(await pipeline.submit(workload));
  const failureObservations = await submitConcurrently(
    pipeline,
    failureWorkloads,
    DEFAULT_FAILURE_CONCURRENCY,
  );

  for (let index = 0; index < normalWorkloads.length; index++) {
    if (syncObservations[index].resultSignature !== asyncObservations[index].resultSignature) {
      throw new Error(`Strategy result mismatch for ${normalWorkloads[index].id}`);
    }
  }

  const summaries = {
    sync: summarize(syncObservations),
    async: summarize(asyncObservations),
    transientFailures: summarize(failureObservations),
  };
  const raw = {
    benchmark: 'synthetic-sync-vs-async-v1',
    runId,
    createdAt: new Date().toISOString(),
    configuration: {
      durationsMs: DEFAULT_DURATIONS_MS,
      runsPerWorkload: runs,
      transientFailureRuns: DEFAULT_FAILURE_RUNS,
      transientFailureModes: TRANSIENT_FAILURE_MODES,
      failureConcurrency: DEFAULT_FAILURE_CONCURRENCY,
      failureDurationMs: FAILURE_DURATION_MS,
      maxAttempts: 3,
      pollingIntervalMs: 10,
      normalSubmission: 'sequential',
      failureSubmission: `concurrent batches of ${DEFAULT_FAILURE_CONCURRENCY}`,
    },
    summaries,
    observations: [...syncObservations, ...asyncObservations, ...failureObservations],
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'report.md'), report(summaries.sync, summaries.async, summaries.transientFailures, runs));
  console.log(`Benchmark report: ${path.join(outputDirectory, 'report.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
