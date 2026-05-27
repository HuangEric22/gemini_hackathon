import { z } from 'zod';

export class LlmJsonResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'LlmJsonResponseError';
    this.cause = options?.cause;
  }
}

export function isLlmJsonResponseError(err: unknown): err is LlmJsonResponseError {
  return err instanceof LlmJsonResponseError;
}

export function parseLlmJson<TSchema extends z.ZodType>(
  text: string | null | undefined,
  model: string,
  schema: TSchema,
): z.infer<TSchema> {
  const trimmed = text?.trim();

  if (!trimmed) {
    throw new LlmJsonResponseError(`Model ${model} returned an empty response`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new LlmJsonResponseError(`Model ${model} returned invalid JSON`, { cause: err });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmJsonResponseError(`Model ${model} returned JSON with an invalid shape`, {
      cause: result.error,
    });
  }

  return result.data;
}
