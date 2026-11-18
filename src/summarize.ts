import type { Config, Reading, WindowSummary } from './types.ts';

/**
 * Tier 1. Clean `readings` (given in arrival order) and summarize each
 * device's accepted readings per window. See "Rules" in the README.
 */
export function summarize(readings: Reading[], config: Config): WindowSummary[] {
  if (readings.length === 0) return [];

  const groups = new Map<
    string,
    { deviceId: string; windowStart: number; count: number; min: number; max: number; sum: number }
  >();

  for (const reading of readings) {
    const windowStart = Math.floor(reading.ts / config.windowMs) * config.windowMs;
    const key = `${reading.deviceId}\0${windowStart}`;
    const value = reading.value as number;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        deviceId: reading.deviceId,
        windowStart,
        count: 1,
        min: value,
        max: value,
        sum: value,
      });
    } else {
      existing.count += 1;
      existing.sum += value;
      if (value < existing.min) existing.min = value;
      if (value > existing.max) existing.max = value;
    }
  }

  return [...groups.values()]
    .map((g) => ({
      deviceId: g.deviceId,
      windowStart: g.windowStart,
      count: g.count,
      min: g.min,
      max: g.max,
      avg: g.sum / g.count,
    }))
    .sort((a, b) => {
      if (a.deviceId < b.deviceId) return -1;
      if (a.deviceId > b.deviceId) return 1;
      return a.windowStart - b.windowStart;
    });
}
