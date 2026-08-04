import { performance } from 'node:perf_hooks';
import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput } from '@/lib/itinerary-generation/generate';
import {
  executeItineraryJobAttempt,
  type ExecutableItineraryJob,
  type ItineraryJobExecutionDependencies,
} from '@/lib/jobs/itinerary-job-executor';

export interface Workload {
  id: string;
  durationMs: number;
  failureMode: 'none' | 'timeout' | 'rate-limit' | 'server-error' | 'permanent';
}

export interface BenchmarkObservation {
  strategy: 'sync' | 'async';
  workloadId: string;
  durationMs: number;
  failureMode: Workload['failureMode'];
  acknowledgementMs: number;
  completionMs: number;
  status: 'succeeded' | 'failed';
  attempts: number;
  recovered: boolean;
  resultSignature: string | null;
}

interface MemoryJob extends ExecutableItineraryJob {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  phase: 'planning' | 'generating' | 'validating' | 'saving' | null;
  result: ItineraryGenerationResponse | null;
  createdAtMs: number;
  completedAtMs: number | null;
  maxAttempts: number;
}

function benchmarkInput(workload: Workload): GenerateItineraryInput {
  return {
    activities: [{ name: workload.id, lat: 37.7749, lng: -122.4194 }],
    numDays: 1,
    transportMode: 'DRIVE',
  };
}

function benchmarkResult(workloadId: string): ItineraryGenerationResponse {
  return {
    days: [{
      day_number: 1,
      brief_description: workloadId,
      items: [{
        title: workloadId,
        start_time: '09:00',
        end_time: '10:00',
        type: 'activity',
      }],
    }],
  };
}

function resultSignature(result: ItineraryGenerationResponse | null) {
  return result ? JSON.stringify(result) : null;
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createSimulatedGenerator(workloads: Map<string, Workload>) {
  const attempts = new Map<string, number>();
  return async (input: GenerateItineraryInput) => {
    const workloadId = input.activities[0]?.name;
    const workload = workloads.get(workloadId);
    if (!workload) throw new Error(`Unknown benchmark workload: ${workloadId}`);
    const attempt = (attempts.get(workloadId) ?? 0) + 1;
    attempts.set(workloadId, attempt);
    await wait(workload.durationMs);
    const isTransientFailure = workload.failureMode === 'timeout'
      || workload.failureMode === 'rate-limit'
      || workload.failureMode === 'server-error';
    if (workload.failureMode === 'permanent' || (isTransientFailure && attempt === 1)) {
      throw new Error(`Simulated ${workload.failureMode} failure`);
    }
    return benchmarkResult(workloadId);
  };
}

export async function runSyncWorkload(
  workload: Workload,
  generate: ReturnType<typeof createSimulatedGenerator>,
): Promise<BenchmarkObservation> {
  const startedAt = performance.now();
  let attempts = 0;
  let result: ItineraryGenerationResponse | null = null;
  let status: BenchmarkObservation['status'] = 'failed';

  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts = attempt;
    try {
      result = await generate(benchmarkInput(workload));
      status = 'succeeded';
      break;
    } catch {
      if (attempt === 3) break;
    }
  }

  const completionMs = performance.now() - startedAt;
  return {
    strategy: 'sync',
    workloadId: workload.id,
    durationMs: workload.durationMs,
    failureMode: workload.failureMode,
    acknowledgementMs: completionMs,
    completionMs,
    status,
    attempts,
    recovered: status === 'succeeded' && attempts > 1,
    resultSignature: resultSignature(result),
  };
}

export class InMemoryJobPipeline {
  private readonly jobs = new Map<string, MemoryJob>();
  private readonly queue: string[] = [];
  private draining = false;
  private sequence = 0;
  readonly dependencies: ItineraryJobExecutionDependencies;

  constructor(
    private readonly generate: ReturnType<typeof createSimulatedGenerator>,
    private readonly pollingIntervalMs = 10,
  ) {
    this.dependencies = {
      loadJob: async jobId => this.jobs.get(jobId),
      incrementAttempt: async jobId => {
        const job = this.requiredJob(jobId);
        job.attemptCount += 1;
      },
      transition: async update => {
        const job = this.requiredJob(update.jobId);
        job.status = update.status;
        job.phase = update.phase;
      },
      generate: async (input, options) => {
        await options.onProgress({ phase: 'generating', message: 'Building benchmark itinerary...' });
        return this.generate(input);
      },
      complete: async (jobId, itinerary) => {
        const job = this.requiredJob(jobId);
        job.result = itinerary;
        job.status = 'succeeded';
        job.phase = null;
        job.completedAtMs = performance.now();
      },
      logCompleted: () => undefined,
    };
  }

  async submit(workload: Workload): Promise<BenchmarkObservation> {
    const submittedAt = performance.now();
    const jobId = `benchmark-job-${++this.sequence}`;
    this.jobs.set(jobId, {
      id: jobId,
      tripId: this.sequence,
      status: 'queued',
      phase: null,
      cancelRequested: false,
      attemptCount: 0,
      inputJson: benchmarkInput(workload),
      result: null,
      createdAtMs: submittedAt,
      completedAtMs: null,
      maxAttempts: 3,
    });
    this.queue.push(jobId);
    this.scheduleDrain();
    const acknowledgementMs = performance.now() - submittedAt;
    const job = await this.waitForTerminal(jobId);

    return {
      strategy: 'async',
      workloadId: workload.id,
      durationMs: workload.durationMs,
      failureMode: workload.failureMode,
      acknowledgementMs,
      completionMs: (job.completedAtMs ?? performance.now()) - submittedAt,
      status: job.status === 'succeeded' ? 'succeeded' : 'failed',
      attempts: job.attemptCount,
      recovered: job.status === 'succeeded' && job.attemptCount > 1,
      resultSignature: resultSignature(job.result),
    };
  }

  private requiredJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Benchmark job not found: ${jobId}`);
    return job;
  }

  private scheduleDrain() {
    if (this.draining) return;
    this.draining = true;
    queueMicrotask(() => void this.drain());
  }

  private async drain() {
    while (this.queue.length) {
      const jobId = this.queue.shift() as string;
      const job = this.requiredJob(jobId);
      while (job.attemptCount < job.maxAttempts && job.status !== 'succeeded') {
        try {
          await executeItineraryJobAttempt(jobId, this.dependencies);
        } catch {
          if (job.attemptCount >= job.maxAttempts) {
            job.status = 'failed';
            job.phase = null;
            job.completedAtMs = performance.now();
          }
        }
      }
    }
    this.draining = false;
    if (this.queue.length) this.scheduleDrain();
  }

  private async waitForTerminal(jobId: string) {
    while (true) {
      const job = this.requiredJob(jobId);
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') return job;
      await wait(this.pollingIntervalMs);
    }
  }
}
