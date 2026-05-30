// Identifies transient model/API failures that are worth retrying or falling back from.
export function isRetryableLlmError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 503 || e.status === 429) return true;
  const msg = e.message ?? '';
  return msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('high demand');
}

