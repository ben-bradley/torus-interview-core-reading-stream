import type { Config, Reading, WindowSummary } from './types.ts';

function isValidValue(value: number | null, config: Config): value is number {
  // Invalid: drop a reading if its value is not a finite number
  // (e.g. null, NaN, +Infinity, -Infinity).
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }

  // Invalid: drop a reading if its value is outside validRange.
  // Bounds are inclusive, so values equal to min/max are valid.
  if (value < config.validRange.min || value > config.validRange.max) {
    return false;
  }

  return true;
}

function isDuplicate(reading: Reading, seenSeqByDevice: Map<string, Set<number>>): boolean {
  // Duplicate: track (deviceId, seq) on first arrival in arrival order.
  // The first arrival is recorded whether or not it is later accepted, so a
  // resend is dropped even if the earlier reading was invalid or too late.
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

function isTooLate(
  reading: Reading,
  config: Config,
  newestAcceptedTsByDevice: Map<string, number>,
): boolean {
  // Too late: drop a reading if its ts is more than maxLatenessMs behind the
  // newest ts already accepted for the same device. Exactly maxLatenessMs
  // behind is still accepted. Lateness is measured per device.
  const newestAcceptedTs = newestAcceptedTsByDevice.get(reading.deviceId);
  if (newestAcceptedTs === undefined) {
    return false; // No accepted readings for this device yet.
  }

  return newestAcceptedTs - reading.ts > config.maxLatenessMs;
}

/**
 * Tier 1. Clean `readings` (given in arrival order) and summarize each
 * device's accepted readings per window. See "Rules" in the README.
 */
export function summarize(readings: Reading[], config: Config): WindowSummary[] {
  if (readings.length === 0) return [];

  // Duplicate tracking: sequence numbers seen per device, recorded on first arrival.
  const seenSeqByDevice = new Map<string, Set<number>>();
  // Too-late tracking: newest ts already accepted per device (accepted readings only).
  const newestAcceptedTsByDevice = new Map<string, number>();

  const groups = new Map<
    string,
    { deviceId: string; windowStart: number; count: number; min: number; max: number; sum: number }
  >();

  for (const reading of readings) {
    // Duplicate: record first-seen (deviceId, seq) and drop resends. This runs
    // before validity/lateness checks so the first arrival is remembered even if
    // it is later rejected (e.g. invalid first arrival, valid resend => both dropped).
    if (isDuplicate(reading, seenSeqByDevice)) {
      continue;
    }

    // Invalid: drop readings whose value is not a finite number within validRange.
    if (!isValidValue(reading.value, config)) {
      continue;
    }

    // Too late: drop readings more than maxLatenessMs behind this device's newest
    // accepted ts (exactly maxLatenessMs behind is still fine).
    if (isTooLate(reading, config, newestAcceptedTsByDevice)) {
      continue;
    }

    // Accepted reading: only accepted readings move the newest accepted ts forward.
    const prevNewestAcceptedTs = newestAcceptedTsByDevice.get(reading.deviceId);
    if (prevNewestAcceptedTs === undefined || reading.ts > prevNewestAcceptedTs) {
      newestAcceptedTsByDevice.set(reading.deviceId, reading.ts);
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
