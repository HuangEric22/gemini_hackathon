import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  itineraryGenerationJobs,
  itineraryItems,
  trips,
  type ItineraryGenerationJobPhase,
  type ItineraryGenerationJobStatus,
} from '@/db/schema';
import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput } from '@/lib/itinerary-generation/generate';

const TERMINAL_STATUSES = new Set<ItineraryGenerationJobStatus>(['succeeded', 'failed', 'cancelled']);

const VALID_TRANSITIONS: Record<ItineraryGenerationJobStatus, ItineraryGenerationJobStatus[]> = {
  queued: ['running', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: ['queued'],
  cancelled: ['queued'],
};

export interface CreateItineraryJobInput {
  id: string;
  tripId: number;
  userId: string;
  input: GenerateItineraryInput;
  idempotencyKey: string;
  provider: 'inngest' | 'bullmq';
  maxAttempts?: number;
}

export async function createItineraryJob(input: CreateItineraryJobInput) {
  const now = new Date();
  const [job] = await db.insert(itineraryGenerationJobs).values({
    id: input.id,
    tripId: input.tripId,
    userId: input.userId,
    inputJson: input.input,
    idempotencyKey: input.idempotencyKey,
    provider: input.provider,
    maxAttempts: input.maxAttempts ?? 3,
    generationVersion: '1',
    promptVersion: '1',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: itineraryGenerationJobs.idempotencyKey }).returning();

  if (job) return job;
  return db.query.itineraryGenerationJobs.findFirst({
    where: eq(itineraryGenerationJobs.idempotencyKey, input.idempotencyKey),
  });
}

export async function getItineraryJob(jobId: string) {
  return db.query.itineraryGenerationJobs.findFirst({ where: eq(itineraryGenerationJobs.id, jobId) });
}

export async function getOwnedItineraryJob(jobId: string, userId: string) {
  return db.query.itineraryGenerationJobs.findFirst({
    where: and(eq(itineraryGenerationJobs.id, jobId), eq(itineraryGenerationJobs.userId, userId)),
  });
}

export async function findActiveItineraryJob(tripId: number, userId: string) {
  const jobs = await db.query.itineraryGenerationJobs.findMany({
    where: and(eq(itineraryGenerationJobs.tripId, tripId), eq(itineraryGenerationJobs.userId, userId)),
    orderBy: (job, { desc }) => [desc(job.createdAt)],
  });
  return jobs.find(job => job.status === 'queued' || job.status === 'running');
}

export async function setItineraryJobProviderRunId(jobId: string, providerRunId?: string) {
  await db.update(itineraryGenerationJobs).set({ providerRunId, updatedAt: new Date() })
    .where(eq(itineraryGenerationJobs.id, jobId));
}

export async function transitionItineraryJob(input: {
  jobId: string;
  status: ItineraryGenerationJobStatus;
  phase?: ItineraryGenerationJobPhase | null;
  message: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const current = await getItineraryJob(input.jobId);
  if (!current) throw new Error('Itinerary generation job not found');
  if (current.status !== input.status && !VALID_TRANSITIONS[current.status].includes(input.status)) {
    throw new Error(`Invalid job transition: ${current.status} -> ${input.status}`);
  }

  const now = new Date();
  await db.update(itineraryGenerationJobs).set({
    status: input.status,
    phase: input.phase,
    message: input.message,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    updatedAt: now,
    startedAt: input.status === 'running' && !current.startedAt ? now : current.startedAt,
    completedAt: TERMINAL_STATUSES.has(input.status) ? now : null,
  }).where(eq(itineraryGenerationJobs.id, input.jobId));
}

export async function incrementItineraryJobAttempt(jobId: string) {
  const job = await getItineraryJob(jobId);
  if (!job) throw new Error('Itinerary generation job not found');
  await db.update(itineraryGenerationJobs).set({
    attemptCount: job.attemptCount + 1,
    updatedAt: new Date(),
  }).where(eq(itineraryGenerationJobs.id, jobId));
}

export async function requestItineraryJobCancellation(jobId: string, userId: string) {
  const job = await getOwnedItineraryJob(jobId, userId);
  if (!job) return false;
  if (TERMINAL_STATUSES.has(job.status)) return true;
  await db.update(itineraryGenerationJobs).set({ cancelRequested: true, updatedAt: new Date() })
    .where(eq(itineraryGenerationJobs.id, jobId));
  return true;
}

export async function resetItineraryJobForRetry(jobId: string, userId: string) {
  const job = await getOwnedItineraryJob(jobId, userId);
  if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return undefined;
  await db.update(itineraryGenerationJobs).set({
    status: 'queued',
    phase: null,
    message: 'Waiting to retry...',
    cancelRequested: false,
    errorCode: null,
    errorMessage: null,
    providerRunId: null,
    completedAt: null,
    updatedAt: new Date(),
  }).where(eq(itineraryGenerationJobs.id, jobId));
  return getOwnedItineraryJob(jobId, userId);
}

export async function completeItineraryJob(jobId: string, itinerary: ItineraryGenerationResponse) {
  const job = await getItineraryJob(jobId);
  if (!job) throw new Error('Itinerary generation job not found');

  const rows = itinerary.days.flatMap(day => day.items.map((item, sortOrder) => ({
    tripId: job.tripId,
    title: item.title,
    description: item.description ?? null,
    dayNumber: day.day_number,
    startTime: item.start_time,
    endTime: item.end_time,
    type: item.type,
    commuteInfo: item.commute_info ?? null,
    commuteSeconds: item.commute_seconds ?? null,
    isSuggested: item.is_suggested,
    sortOrder,
    lat: item.lat,
    lng: item.lng,
  })));

  await db.transaction(async tx => {
    await tx.delete(itineraryItems).where(eq(itineraryItems.tripId, job.tripId));
    if (rows.length) await tx.insert(itineraryItems).values(rows);
    await tx.update(itineraryGenerationJobs).set({
      resultJson: itinerary,
      status: 'succeeded',
      phase: null,
      message: 'Your itinerary is ready.',
      updatedAt: new Date(),
      completedAt: new Date(),
    }).where(eq(itineraryGenerationJobs.id, jobId));
  });
}

export async function userOwnsTrip(tripId: number, userId: string) {
  const trip = await db.query.trips.findFirst({
    columns: { id: true },
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });
  return Boolean(trip);
}
