const counters = new Map<string, number>();

export function increment(metric: string) {
  counters.set(metric, (counters.get(metric) ?? 0) + 1);
}

export function snapshotMetrics() {
  return Object.fromEntries(counters.entries());
}
