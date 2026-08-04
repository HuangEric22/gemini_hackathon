import { randomUUID } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { getItineraryJobQueue } from '@/lib/jobs/itinerary-job-queue';
import { submitItineraryJobSchema } from '@/lib/jobs/itinerary-job-input';
import {
  createItineraryJob,
  findActiveItineraryJob,
  setItineraryJobProviderRunId,
  transitionItineraryJob,
  userOwnsTrip,
} from '@/lib/jobs/itinerary-job-repository';

export async function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const tripId = Number((await context.params).tripId);
  if (!Number.isInteger(tripId) || !(await userOwnsTrip(tripId, userId))) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }

  const parsed = submitItineraryJobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid itinerary request' }, { status: 400 });

  const active = await findActiveItineraryJob(tripId, userId);
  if (active) return Response.json({
    jobId: active.id,
    status: active.status,
    statusUrl: `/api/itinerary-jobs/${active.id}`,
    reused: true,
  }, { status: 202 });

  const jobId = `job_${randomUUID()}`;
  const job = await createItineraryJob({
    id: jobId,
    tripId,
    userId,
    input: parsed.data.input,
    idempotencyKey: `${userId}:${tripId}:${parsed.data.idempotencyKey}`,
    provider: 'inngest',
  });
  if (!job) return Response.json({ error: 'Could not create generation job' }, { status: 500 });

  const queue = await getItineraryJobQueue();
  try {
    const { providerRunId } = await queue.enqueue({ jobId: job.id });
    await setItineraryJobProviderRunId(job.id, providerRunId);
  } catch (error) {
    await transitionItineraryJob({
      jobId: job.id,
      status: 'failed',
      message: 'We could not start itinerary generation. Please try again.',
      errorCode: 'QUEUE_UNAVAILABLE',
      errorMessage: 'The generation queue is temporarily unavailable.',
    });
    console.error('[itinerary-jobs] enqueue failed', { jobId: job.id, error });
    return Response.json({ error: 'Generation queue unavailable' }, { status: 503 });
  }
  return Response.json({
    jobId: job.id,
    status: job.status,
    statusUrl: `/api/itinerary-jobs/${job.id}`,
    reused: false,
  }, { status: 202 });
}
