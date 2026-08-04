import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { formatMs, formatPercent, summarizeLatency } from './metrics';

const DEFAULT_RUNS = 10;
const DEFAULT_WARMUPS = 2;
const DEFAULT_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 15_000;

interface SubmissionObservation {
  tripId: number;
  latencyMs: number;
  statusCode: number;
  accepted: boolean;
  reused: boolean | null;
  jobId: string | null;
  error: string | null;
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${value} is not a positive integer`);
  return parsed;
}

function parseTripIds(value: string | undefined) {
  if (!value) return [];
  return value.split(',').map(item => Number(item.trim())).filter(Number.isInteger);
}

function loadPayload() {
  const payloadPath = argument('--payload');
  if (payloadPath) return JSON.parse(fs.readFileSync(path.resolve(payloadPath), 'utf8')) as unknown;
  return {
    activities: [{ name: 'Golden Gate Park', lat: 37.7694, lng: -122.4862 }],
    numDays: 1,
    transportMode: 'DRIVE',
  };
}

function authorizationHeaders(): Record<string, string> {
  const cookie = process.env.BENCHMARK_COOKIE;
  const token = process.env.BENCHMARK_AUTH_TOKEN;
  if (cookie) return { Cookie: cookie };
  if (token) return { Authorization: `Bearer ${token}` };
  throw new Error('Set BENCHMARK_COOKIE or BENCHMARK_AUTH_TOKEN for a Clerk-authenticated user');
}

async function submit(
  baseUrl: string,
  tripId: number,
  input: unknown,
  authHeaders: Record<string, string>,
): Promise<SubmissionObservation> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/trips/${tripId}/itinerary-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ input, idempotencyKey: crypto.randomUUID() }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null) as { jobId?: string; reused?: boolean } | null;
    const accepted = response.status === 202
      && typeof body?.jobId === 'string'
      && body.reused === false;
    return {
      tripId,
      latencyMs: performance.now() - startedAt,
      statusCode: response.status,
      accepted,
      reused: body?.reused ?? null,
      jobId: body?.jobId ?? null,
      error: accepted ? null : body?.reused ? 'Existing active job was reused' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      tripId,
      latencyMs: performance.now() - startedAt,
      statusCode: 0,
      accepted: false,
      reused: null,
      jobId: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function submitInBatches(
  tripIds: number[],
  concurrency: number,
  run: (tripId: number) => Promise<SubmissionObservation>,
) {
  const observations: SubmissionObservation[] = [];
  for (let index = 0; index < tripIds.length; index += concurrency) {
    observations.push(...await Promise.all(tripIds.slice(index, index + concurrency).map(run)));
  }
  return observations;
}

function buildReport(input: {
  baseUrl: string;
  runs: number;
  warmups: number;
  concurrency: number;
  observations: SubmissionObservation[];
}) {
  const accepted = input.observations.filter(item => item.accepted);
  const latency = summarizeLatency(accepted.map(item => item.latencyMs));
  return `# Real HTTP async acknowledgement benchmark

> Measures the deployed POST request through authentication, job persistence, Inngest enqueue, provider-run persistence, and the 202 response. It does not measure itinerary completion time.

| Metric | Result |
|---|---:|
| Measured submissions | ${input.runs} |
| Successful 202 responses | ${accepted.length} |
| Success rate | ${formatPercent(accepted.length / Math.max(1, input.runs))} |
| Acknowledgement p50 | ${formatMs(latency.p50)} |
| Acknowledgement p95 | ${formatMs(latency.p95)} |

## Configuration

- Target: ${input.baseUrl}
- Warm-up submissions: ${input.warmups}
- Concurrent submissions: ${input.concurrency}
- Request timeout: ${REQUEST_TIMEOUT_MS} ms
- Every submission uses a distinct owned trip and idempotency key
- Each accepted request creates a real background generation job and may incur provider cost
`;
}

async function main() {
  const baseUrl = (argument('--base-url') ?? process.env.BENCHMARK_BASE_URL)?.replace(/\/$/, '');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('Provide --base-url or BENCHMARK_BASE_URL as an HTTP(S) URL');
  }
  const runs = positiveInteger(argument('--runs'), DEFAULT_RUNS);
  const warmups = positiveInteger(argument('--warmups'), DEFAULT_WARMUPS);
  const concurrency = positiveInteger(argument('--concurrency'), DEFAULT_CONCURRENCY);
  const tripIds = parseTripIds(argument('--trip-ids') ?? process.env.BENCHMARK_TRIP_IDS);
  const requiredTripIds = runs + warmups;
  if (tripIds.length < requiredTripIds) {
    throw new Error(`Provide at least ${requiredTripIds} distinct owned trip IDs; received ${tripIds.length}`);
  }
  if (new Set(tripIds.slice(0, requiredTripIds)).size !== requiredTripIds) {
    throw new Error('Trip IDs must be distinct so active-job reuse cannot invalidate the measurement');
  }

  const input = loadPayload();
  const authHeaders = authorizationHeaders();
  const run = (tripId: number) => submit(baseUrl, tripId, input, authHeaders);
  const warmupObservations = await submitInBatches(tripIds.slice(0, warmups), concurrency, run);
  if (warmupObservations.some(item => !item.accepted)) {
    throw new Error(`Warm-up failed: ${JSON.stringify(warmupObservations)}`);
  }
  const observations = await submitInBatches(
    tripIds.slice(warmups, requiredTripIds),
    concurrency,
    run,
  );
  const acceptedJobIds = observations.filter(item => item.accepted).map(item => item.jobId as string);
  if (new Set(acceptedJobIds).size !== acceptedJobIds.length) {
    throw new Error('Duplicate job IDs detected; at least one request reused an active job');
  }

  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outputRoot = argument('--output') ?? path.join('eval', 'results', 'async-pipeline-http');
  const outputDirectory = path.resolve(outputRoot, runId);
  const reportInput = { baseUrl, runs, warmups, concurrency, observations };
  const raw = {
    benchmark: 'real-http-async-acknowledgement-v1',
    runId,
    createdAt: new Date().toISOString(),
    configuration: { baseUrl, runs, warmups, concurrency, requestTimeoutMs: REQUEST_TIMEOUT_MS },
    warmupObservations,
    observations,
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'report.md'), buildReport(reportInput));
  console.log(`HTTP benchmark report: ${path.join(outputDirectory, 'report.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
