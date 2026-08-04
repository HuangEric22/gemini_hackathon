import { NonRetriableError } from 'inngest';
import { inngest } from '@/inngest/client';
import {
  generateItineraryForJob,
  prepareItineraryJobAttempt,
  saveItineraryJobResult,
} from '@/lib/jobs/itinerary-job-executor';
import { productionItineraryJobExecutionDependencies } from '@/lib/jobs/production-itinerary-job-execution';
import {
  getItineraryJob,
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
      const loaded = await prepareItineraryJobAttempt(
        jobId,
        productionItineraryJobExecutionDependencies,
        message => new NonRetriableError(message),
      );
      if (loaded.status === 'succeeded') return loaded;
      logJobEvent('info', 'job.started', { jobId, tripId: loaded.tripId, attempt: loaded.attemptCount + 1 });
      return loaded;
    });

    if (job.status === 'succeeded') return { jobId, alreadyCompleted: true };

    const itinerary = await step.run('generate-itinerary', async () => {
      return generateItineraryForJob(
        jobId,
        job.inputJson,
        productionItineraryJobExecutionDependencies,
      );
    });

    await step.run('save-itinerary', async () => {
      await saveItineraryJobResult(
        job,
        itinerary,
        workflowStartedAt,
        productionItineraryJobExecutionDependencies,
        message => new NonRetriableError(message),
      );
    });

    return { jobId, completed: true };
  },
);
