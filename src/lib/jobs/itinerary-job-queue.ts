export interface ItineraryJobQueue {
  enqueue(input: { jobId: string }): Promise<{ providerRunId?: string }>;
  cancel?(input: { jobId: string; providerRunId?: string }): Promise<void>;
}

export async function getItineraryJobQueue(): Promise<ItineraryJobQueue> {
  const { inngestItineraryJobQueue } = await import('./providers/inngest-itinerary-job-queue');
  return inngestItineraryJobQueue;
}
