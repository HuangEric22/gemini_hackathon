export interface LatencySummary {
  p50: number;
  p95: number;
}

export function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.min(rank, sorted.length - 1)];
}

export function summarizeLatency(values: number[]): LatencySummary {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

export function formatMs(value: number) {
  return `${value < 1 ? value.toFixed(3) : value.toFixed(1)} ms`;
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
