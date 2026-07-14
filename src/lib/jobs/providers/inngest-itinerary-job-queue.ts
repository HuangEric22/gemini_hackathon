import { inngest } from '@/inngest/client';
import type { ItineraryJobQueue } from '../itinerary-job-queue';

export const inngestItineraryJobQueue: ItineraryJobQueue = {
  async enqueue({ jobId }) {
    const result = await inngest.send({
      name: 'app/itinerary.generate.requested',
      data: { jobId },
    });
    return { providerRunId: result.ids[0] };
  },

  async cancel({ jobId }) {
    await inngest.send({
      name: 'app/itinerary.generate.cancelled',
      data: { jobId },
    });
  },
};
