import { describe, expect, it, afterEach } from 'vitest';
import {
  getDatabaseConfig,
  getGoogleMapsServerApiKey,
  getOptionalEnv,
  getRequiredEnv,
} from '@/lib/env';

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
});

describe('env helpers', () => {
  it('returns trimmed values for configured env vars', () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: ' test-key ' };

    expect(getRequiredEnv('GEMINI_API_KEY')).toBe('test-key');
  });

  it('treats missing and blank optional values as undefined', () => {
    process.env = { ...originalEnv, DB_AUTH_TOKEN: '   ' };

    expect(getOptionalEnv('DB_AUTH_TOKEN')).toBeUndefined();
  });

  it('throws a clear error for missing required values', () => {
    process.env = { ...originalEnv };
    delete process.env.DB_FILE_NAME;

    expect(() => getRequiredEnv('DB_FILE_NAME')).toThrow(
      'Missing required environment variable: DB_FILE_NAME',
    );
  });

  it('builds database config with an optional auth token', () => {
    process.env = {
      ...originalEnv,
      DB_FILE_NAME: 'file:local.db',
      DB_AUTH_TOKEN: '',
    };

    expect(getDatabaseConfig()).toEqual({
      url: 'file:local.db',
      authToken: undefined,
    });
  });

  it('prefers the server Google Maps key over the public fallback', () => {
    process.env = {
      ...originalEnv,
      GOOGLE_MAPS_API_KEY: 'server-key',
      NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'public-key',
    };

    expect(getGoogleMapsServerApiKey()).toBe('server-key');
  });
});
