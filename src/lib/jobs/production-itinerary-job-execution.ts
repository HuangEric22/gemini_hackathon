import { generateItineraryCore } from '@/lib/itinerary-generation/generate';
import {
  completeItineraryJob,
  getItineraryJob,
  incrementItineraryJobAttempt,
  transitionItineraryJob,
} from './itinerary-job-repository';
import type { ItineraryJobExecutionDependencies } from './itinerary-job-executor';
import { logJobEvent } from './job-logger';

export const productionItineraryJobExecutionDependencies: ItineraryJobExecutionDependencies = {
  loadJob: getItineraryJob,
  incrementAttempt: incrementItineraryJobAttempt,
  transition: transitionItineraryJob,
  generate: generateItineraryCore,
  complete: completeItineraryJob,
  logCompleted: input => logJobEvent('info', 'job.completed', input),
};
