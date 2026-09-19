const counters = new Map<string, number>();

export function increment(metric: string, amount = 1) {
  counters.set(metric, (counters.get(metric) ?? 0) + amount);
}

export function setGauge(metric: string, value: number) {
  counters.set(metric, value);
}

export function snapshotMetrics() {
  return Object.fromEntries(counters.entries());
}
