import { auth } from '@clerk/nextjs/server';
import { getItineraryJobQueue } from '@/lib/jobs/itinerary-job-queue';
import { resetItineraryJobForRetry, setItineraryJobProviderRunId } from '@/lib/jobs/itinerary-job-repository';

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const jobId = (await context.params).jobId;
  const job = await resetItineraryJobForRetry(jobId, userId);
  if (!job) return Response.json({ error: 'Job is not retryable' }, { status: 409 });
  const queue = await getItineraryJobQueue();
  const { providerRunId } = await queue.enqueue({ jobId });
  await setItineraryJobProviderRunId(jobId, providerRunId);
  return Response.json({ jobId, status: 'queued' }, { status: 202 });
}
