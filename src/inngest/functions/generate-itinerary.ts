import { NonRetriableError } from 'inngest';
import { inngest } from '@/inngest/client';
import { generateItineraryCore, type GenerateItineraryInput } from '@/lib/itinerary-generation/generate';
import {
  completeItineraryJob,
  getItineraryJob,
  incrementItineraryJobAttempt,
  transitionItineraryJob,
} from '@/lib/jobs/itinerary-job-repository';
import { logJobEvent, safeJobError } from '@/lib/jobs/job-logger';

export const generateItineraryWorkflow = inngest.createFunction(
  {
    id: 'generate-itinerary',
    triggers: [{ event: 'app/itinerary.generate.requested' }],
    retries: 2,
    singleton: { key: 'event.data.jobId', mode: 'skip' },
    cancelOn: [{
      event: 'app/itinerary.generate.cancelled',
      match: 'async.data.jobId',
    }],
    onFailure: async ({ event, error }) => {
      const originalEvent = event.data.event as { data?: { jobId?: string } };
      const jobId = originalEvent.data?.jobId;
      if (!jobId) return;
      const job = await getItineraryJob(jobId);
      if (!job || job.status === 'cancelled' || job.status === 'succeeded') return;
      const safeError = safeJobError(error);
      logJobEvent('error', 'job.failed', { jobId, tripId: job.tripId, attempt: job.attemptCount, errorCode: safeError.code });
      await transitionItineraryJob({
        jobId,
        status: 'failed',
        message: 'We could not generate this itinerary. Please try again.',
        errorCode: safeError.code,
        errorMessage: safeError.message,
      });
    },
  },
  async ({ event, step }) => {
    const jobId = String(event.data.jobId);
    const workflowStartedAt = Date.now();

    const job = await step.run('load-job', async () => {
      const loaded = await getItineraryJob(jobId);
      if (!loaded) throw new NonRetriableError('Itinerary generation job not found');
      if (loaded.cancelRequested || loaded.status === 'cancelled') {
        throw new NonRetriableError('Itinerary generation was cancelled');
      }
      if (loaded.status === 'succeeded') return loaded;
      await incrementItineraryJobAttempt(jobId);
      await transitionItineraryJob({
        jobId,
        status: 'running',
        phase: 'planning',
        message: 'Analyzing your activities...',
      });
      logJobEvent('info', 'job.started', { jobId, tripId: loaded.tripId, attempt: loaded.attemptCount + 1 });
      return loaded;
    });

    if (job.status === 'succeeded') return { jobId, alreadyCompleted: true };

    const itinerary = await step.run('generate-itinerary', async () => {
      return generateItineraryCore(job.inputJson as GenerateItineraryInput, {
        onProgress: async update => {
          const phase = update.phase === 'planning'
            ? 'planning'
            : update.phase === 'validating'
              ? 'validating'
              : 'generating';
          await transitionItineraryJob({
            jobId,
            status: 'running',
            phase,
            message: update.message,
          });
        },
      });
    });

    await step.run('save-itinerary', async () => {
      const latest = await getItineraryJob(jobId);
      if (!latest || latest.cancelRequested) {
        throw new NonRetriableError('Itinerary generation was cancelled');
      }
      await transitionItineraryJob({
        jobId,
        status: 'running',
        phase: 'saving',
        message: 'Saving your itinerary...',
      });
      await completeItineraryJob(jobId, itinerary);
      logJobEvent('info', 'job.completed', {
        jobId,
        tripId: job.tripId,
        durationMs: Date.now() - workflowStartedAt,
      });
    });

    return { jobId, completed: true };
  },
);
