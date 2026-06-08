import { z } from 'zod';

const nonEmptyEnvValue = z.string().trim().min(1);

type EnvKey =
  | 'DB_FILE_NAME'
  | 'DB_AUTH_TOKEN'
  | 'GEMINI_API_KEY'
  | 'GOOGLE_MAPS_API_KEY'
  | 'NEXT_PUBLIC_GOOGLE_MAPS_KEY';

export function getOptionalEnv(key: EnvKey): string | undefined {
  const result = nonEmptyEnvValue.safeParse(process.env[key]);
  return result.success ? result.data : undefined;
}

export function getRequiredEnv(key: EnvKey): string {
  const value = getOptionalEnv(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function getDatabaseConfig() {
  return {
    url: getRequiredEnv('DB_FILE_NAME'),
    authToken: getOptionalEnv('DB_AUTH_TOKEN'),
  };
}

export function getRequiredGeminiApiKey(): string {
  return getRequiredEnv('GEMINI_API_KEY');
}

export function getOptionalGeminiApiKey(): string | undefined {
  return getOptionalEnv('GEMINI_API_KEY');
}

export function getOptionalGoogleMapsServerApiKey(): string | undefined {
  return getOptionalEnv('GOOGLE_MAPS_API_KEY') ?? getOptionalEnv('NEXT_PUBLIC_GOOGLE_MAPS_KEY');
}

export function getGoogleMapsServerApiKey(): string {
  const apiKey = getOptionalGoogleMapsServerApiKey();
  if (!apiKey) {
    throw new Error('Missing required environment variable: GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_KEY');
  }
  return apiKey;
}
