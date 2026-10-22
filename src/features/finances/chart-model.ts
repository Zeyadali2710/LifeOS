export function chartScale(values: number[], height: number) {
  const max = Math.max(0, ...values), min = Math.min(0, ...values);
  const span = max - min || 1;
  return { y: (value: number) => (max - value) / span * height, zero: max / span * height };
}
export function budgetState(actual: number, limit: number | null) {
  const percent = limit === null ? 0 : limit === 0 ? actual > 0 ? 100 : 0 : Math.min(100, Math.max(0, actual / limit * 100));
  return { percent, tone: limit !== null && actual > limit ? 'failed' : limit !== null && percent > 85 ? 'approval' : 'working' } as const;
}
