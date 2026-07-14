'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItineraryGenerationResponse } from '@/shared';
import type { GenerateItineraryInput } from '@/lib/itinerary-generation/generate';

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

interface JobSnapshot {
  id: string;
  status: JobStatus;
  phase: string | null;
  message: string;
  result?: ItineraryGenerationResponse | null;
  error?: { code?: string | null; message?: string | null } | null;
}

const TERMINAL = new Set<JobStatus>(['succeeded', 'failed', 'cancelled']);

export function useItineraryGenerationJob(tripId: number | null) {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const startedAtRef = useRef(0);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;

  const poll = useCallback(async (jobId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/itinerary-jobs/${jobId}`, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load generation status');
    const snapshot = await response.json() as JobSnapshot;
    setJob(snapshot);
    return snapshot;
  }, []);

  useEffect(() => {
    if (!tripId) return;
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/itinerary-jobs/active`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.job) {
          startedAtRef.current = Date.now();
          setJob(data.job);
        }
      })
      .catch(error => {
        if (error instanceof Error && error.name !== 'AbortError') console.error(error);
      });
    return () => controller.abort();
  }, [tripId]);

  useEffect(() => {
    if (!activeJobId || !activeJobStatus || TERMINAL.has(activeJobStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const schedule = async () => {
      try {
        const next = await poll(activeJobId, controller.signal);
        if (TERMINAL.has(next.status)) return;
        const elapsed = Date.now() - startedAtRef.current;
        const delay = document.hidden ? 10_000 : elapsed < 30_000 ? 1_000 : elapsed < 120_000 ? 2_000 : 5_000;
        timer = setTimeout(schedule, delay);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') timer = setTimeout(schedule, 5_000);
      }
    };

    timer = setTimeout(schedule, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeJobId, activeJobStatus, poll]);

  const submit = useCallback(async (input: GenerateItineraryInput) => {
    if (!tripId) throw new Error('Trip is not loaded');
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch(`/api/trips/${tripId}/itinerary-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, idempotencyKey }),
    });
    if (!response.ok) throw new Error('Could not start itinerary generation');
    const created = await response.json() as { jobId: string; status: JobStatus };
    startedAtRef.current = Date.now();
    setJob({ id: created.jobId, status: created.status, phase: null, message: 'Waiting to start...' });
    return created.jobId;
  }, [tripId]);

  const cancel = useCallback(async () => {
    if (!job) return;
    await fetch(`/api/itinerary-jobs/${job.id}`, { method: 'DELETE' });
    await poll(job.id);
  }, [job, poll]);

  const retry = useCallback(async () => {
    if (!job) return;
    const response = await fetch(`/api/itinerary-jobs/${job.id}/retry`, { method: 'POST' });
    if (!response.ok) throw new Error('Could not retry itinerary generation');
    startedAtRef.current = Date.now();
    setJob(current => current ? { ...current, status: 'queued', message: 'Waiting to retry...' } : current);
  }, [job]);

  return {
    job,
    submit,
    cancel,
    retry,
    isGenerating: job?.status === 'queued' || job?.status === 'running',
  };
}
