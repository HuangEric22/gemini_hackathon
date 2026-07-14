import { auth } from '@clerk/nextjs/server';
import { findActiveItineraryJob, userOwnsTrip } from '@/lib/jobs/itinerary-job-repository';

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const tripId = Number((await context.params).tripId);
  if (!Number.isInteger(tripId) || !(await userOwnsTrip(tripId, userId))) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }
  const job = await findActiveItineraryJob(tripId, userId);
  return Response.json({ job: job ? { id: job.id, status: job.status, phase: job.phase, message: job.message } : null });
}
