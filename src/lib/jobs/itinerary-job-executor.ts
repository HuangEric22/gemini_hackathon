import type { ItineraryGenerationResponse } from '@/shared';
import {
  type GenerateItineraryInput,
  type GenerationProgress,
} from '@/lib/itinerary-generation/generate';

export interface ExecutableItineraryJob {
  id: string;
  tripId: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  cancelRequested: boolean;
  attemptCount: number;
  inputJson: unknown;
}

export interface ItineraryJobExecutionDependencies {
  loadJob(jobId: string): Promise<ExecutableItineraryJob | undefined>;
  incrementAttempt(jobId: string): Promise<void>;
  transition(input: {
    jobId: string;
    status: 'running';
    phase: 'planning' | 'generating' | 'validating' | 'saving';
    message: string;
  }): Promise<void>;
  generate(
    input: GenerateItineraryInput,
    options: { onProgress(update: GenerationProgress): Promise<void> },
  ): Promise<ItineraryGenerationResponse>;
  complete(jobId: string, itinerary: ItineraryGenerationResponse): Promise<void>;
  logCompleted(input: { jobId: string; tripId: number; durationMs: number }): void;
}

export async function prepareItineraryJobAttempt(
  jobId: string,
  dependencies: ItineraryJobExecutionDependencies,
  nonRetriableError: (message: string) => Error = message => new Error(message),
) {
  const job = await dependencies.loadJob(jobId);
  if (!job) throw nonRetriableError('Itinerary generation job not found');
  if (job.cancelRequested || job.status === 'cancelled') {
    throw nonRetriableError('Itinerary generation was cancelled');
  }
  if (job.status === 'succeeded') return job;

  await dependencies.incrementAttempt(jobId);
  await dependencies.transition({
    jobId,
    status: 'running',
    phase: 'planning',
    message: 'Analyzing your activities...',
  });
  return job;
}

export async function generateItineraryForJob(
  jobId: string,
  input: unknown,
  dependencies: ItineraryJobExecutionDependencies,
) {
  return dependencies.generate(input as GenerateItineraryInput, {
    onProgress: async update => {
      const phase = update.phase === 'planning'
        ? 'planning'
        : update.phase === 'validating'
          ? 'validating'
          : 'generating';
      await dependencies.transition({
        jobId,
        status: 'running',
        phase,
        message: update.message,
      });
    },
  });
}

export async function saveItineraryJobResult(
  job: ExecutableItineraryJob,
  itinerary: ItineraryGenerationResponse,
  startedAt: number,
  dependencies: ItineraryJobExecutionDependencies,
  nonRetriableError: (message: string) => Error = message => new Error(message),
) {
  const latest = await dependencies.loadJob(job.id);
  if (!latest || latest.cancelRequested) {
    throw nonRetriableError('Itinerary generation was cancelled');
  }
  await dependencies.transition({
    jobId: job.id,
    status: 'running',
    phase: 'saving',
    message: 'Saving your itinerary...',
  });
  await dependencies.complete(job.id, itinerary);
  dependencies.logCompleted({
    jobId: job.id,
    tripId: job.tripId,
    durationMs: Date.now() - startedAt,
  });
}

/** Runs one attempt. Queue providers remain responsible for retry scheduling. */
export async function executeItineraryJobAttempt(
  jobId: string,
  dependencies: ItineraryJobExecutionDependencies,
) {
  const startedAt = Date.now();
  const job = await prepareItineraryJobAttempt(jobId, dependencies);
  if (job.status === 'succeeded') return { jobId, alreadyCompleted: true };
  const itinerary = await generateItineraryForJob(jobId, job.inputJson, dependencies);
  await saveItineraryJobResult(job, itinerary, startedAt, dependencies);
  return { jobId, completed: true };
}
