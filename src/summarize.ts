import type { Config, Reading, WindowSummary } from './types.ts';

function isValidValue(value: number | null, config: Config): value is number {
  // Rule 1 (Invalid): drop a reading if its value is not a finite number
  // (e.g. null, NaN, +Infinity, -Infinity).
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }

  // Rule 1 (Invalid): drop a reading if its value is outside validRange.
  // Bounds are inclusive, so values equal to min/max are valid.
  if (value < config.validRange.min || value > config.validRange.max) {
    return false;
  }

  return true;
}

function isDuplicate(reading: Reading, seenSeqByDevice: Map<string, Set<number>>): boolean {
  // Rule 2 (Duplicate): track (deviceId, seq) on first arrival in arrival order.
  // The first arrival is recorded whether or not it is later accepted, so a
  // resend is dropped even if the earlier reading was invalid/late.
  let seenSeqs = seenSeqByDevice.get(reading.deviceId);
  if (!seenSeqs) {
    seenSeqs = new Set<number>();
    seenSeqByDevice.set(reading.deviceId, seenSeqs);
  }

  if (seenSeqs.has(reading.seq)) {
    return true; // Duplicate: same deviceId and seq arrived earlier.
  }

  seenSeqs.add(reading.seq); // First time seen: remember it now.
  return false;
}

/**
 * Tier 1. Clean `readings` (given in arrival order) and summarize each
 * device's accepted readings per window. See "Rules" in the README.
 */
export function summarize(readings: Reading[], config: Config): WindowSummary[] {
  if (readings.length === 0) return [];

  // Rule 2 state: sequence numbers seen per device, recorded on first arrival.
  const seenSeqByDevice = new Map<string, Set<number>>();

  const groups = new Map<
    string,
    { deviceId: string; windowStart: number; count: number; min: number; max: number; sum: number }
  >();

  for (const reading of readings) {
    // Rule 2 (Duplicate): drop duplicates (and record first-seen seqs regardless
    // of whether this reading is ultimately accepted).
    if (isDuplicate(reading, seenSeqByDevice)) {
      continue;
    }

    // Rule 1 (Invalid): drop readings with invalid values.
    // (Rule 3 "too late" is not yet enforced in this implementation.)
    if (!isValidValue(reading.value, config)) {
      continue;
    }

    const windowStart = Math.floor(reading.ts / config.windowMs) * config.windowMs;
    const key = `${reading.deviceId}\0${windowStart}`;
    const value = reading.value; // narrowed to a valid finite number
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
