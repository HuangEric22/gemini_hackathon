export function logJobEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'itinerary-generation',
    event,
    ...fields,
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

export function safeJobError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|RESOURCE_EXHAUSTED|rate.?limit/i.test(message)) {
    return { code: 'PROVIDER_RATE_LIMITED', message: 'The AI service is busy. Please try again.' };
  }
  if (/503|UNAVAILABLE|network|fetch failed/i.test(message)) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'A generation service is temporarily unavailable.' };
  }
  return { code: 'GENERATION_FAILED', message: 'We could not generate this itinerary. Please try again.' };
}
