import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { generateItineraryWorkflow } from '@/inngest/functions/generate-itinerary';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateItineraryWorkflow],
});
