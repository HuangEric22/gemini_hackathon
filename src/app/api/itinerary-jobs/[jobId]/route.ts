import { auth } from '@clerk/nextjs/server';
import { getItineraryJobQueue } from '@/lib/jobs/itinerary-job-queue';
import {
  getOwnedItineraryJob,
  requestItineraryJobCancellation,
  transitionItineraryJob,
} from '@/lib/jobs/itinerary-job-repository';
import { logJobEvent } from '@/lib/jobs/job-logger';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await getOwnedItineraryJob((await context.params).jobId, userId);
  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
  return Response.json({
    id: job.id,
    tripId: job.tripId,
    status: job.status,
    phase: job.phase,
    message: job.message,
    result: job.status === 'succeeded' ? job.resultJson : null,
    error: job.status === 'failed' ? { code: job.errorCode, message: job.errorMessage } : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const jobId = (await context.params).jobId;
  const job = await getOwnedItineraryJob(jobId, userId);
  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
  await requestItineraryJobCancellation(jobId, userId);
  const queue = await getItineraryJobQueue();
  await queue.cancel?.({ jobId, providerRunId: job.providerRunId ?? undefined });
  if (job.status === 'queued' || job.status === 'running') {
    await transitionItineraryJob({ jobId, status: 'cancelled', message: 'Itinerary generation cancelled.' });
  }
  logJobEvent('info', 'job.cancelled', { jobId, tripId: job.tripId, userId });
  return Response.json({ id: jobId, status: 'cancelled' });
}
