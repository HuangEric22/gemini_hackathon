import { describe, expect, it } from 'vitest';
import { percentile, summarizeLatency } from '../../eval/async-pipeline/metrics';
import {
  createSimulatedGenerator,
  InMemoryJobPipeline,
  runSyncWorkload,
  type Workload,
} from '../../eval/async-pipeline/pipeline';

function workload(
  id: string,
  durationMs = 15,
  failureMode: Workload['failureMode'] = 'none',
): Workload {
  return { id, durationMs, failureMode };
}

describe('async pipeline benchmark', () => {
  it('calculates nearest-rank p50 and p95 values', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(summarizeLatency(values)).toEqual({ p50: 50, p95: 100 });
  });

  it('returns the same payload while acknowledging async work before completion', async () => {
    const item = workload('same-result', 25);
    const workloads = new Map([[item.id, item]]);
    const sync = await runSyncWorkload(item, createSimulatedGenerator(workloads));
    const queued = await new InMemoryJobPipeline(createSimulatedGenerator(workloads), 2).submit(item);

    expect(sync.resultSignature).toBe(queued.resultSignature);
    expect(queued.acknowledgementMs).toBeLessThan(queued.completionMs);
    expect(queued.acknowledgementMs).toBeLessThan(item.durationMs);
    expect(sync.acknowledgementMs).toBeGreaterThanOrEqual(item.durationMs - 2);
  });

  it('recovers a first-attempt transient failure', async () => {
    const item = workload('transient', 5, 'timeout');
    const pipeline = new InMemoryJobPipeline(createSimulatedGenerator(new Map([[item.id, item]])), 1);
    const result = await pipeline.submit(item);

    expect(result.status).toBe('succeeded');
    expect(result.attempts).toBe(2);
    expect(result.recovered).toBe(true);
    expect(result.completionMs).toBeGreaterThanOrEqual(item.durationMs * 2 - 2);
  });

  it('fails permanently after max attempts and continues with the next queued job', async () => {
    const permanent = workload('permanent', 3, 'permanent');
    const healthy = workload('healthy-after-failure', 3);
    const workloads = new Map([
      [permanent.id, permanent],
      [healthy.id, healthy],
    ]);
    const pipeline = new InMemoryJobPipeline(createSimulatedGenerator(workloads), 1);
    const [failed, succeeded] = await Promise.all([
      pipeline.submit(permanent),
      pipeline.submit(healthy),
    ]);

    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(3);
    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.attempts).toBe(1);
    expect(succeeded.completionMs).toBeGreaterThan(healthy.durationMs);
  });
});
