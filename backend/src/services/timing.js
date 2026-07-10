import { haversineKm } from './optimizer.js';

/**
 * Estimates a clock time-of-day for each stop along an already-sequenced
 * route, walking outward from the depot at a configurable average speed.
 * This is a planning estimate (straight-line/road-ratio blend), not a
 * live traffic ETA — good enough to communicate roughly when a bus will
 * be at a stop, not to the minute.
 *
 * routeStartTime: 'HH:MM' (24h) — when the bus leaves the depot
 * avgSpeedKmh: effective average speed including stop dwell time
 * stopDwellMinutes: minutes added at each stop for boarding
 */
export function computeStopTimings(depot, orderedStops, { routeStartTime = '07:00', avgSpeedKmh = 25, stopDwellMinutes = 1 } = {}) {
  const [startH, startM] = routeStartTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;

  let cumulativeMinutes = 0;
  let prev = depot;
  const timings = [];

  for (const stop of orderedStops) {
    const legKm = haversineKm(prev, stop);
    const travelMinutes = (legKm / avgSpeedKmh) * 60;
    cumulativeMinutes += travelMinutes;
    const etaMinutesFromStart = Math.round(cumulativeMinutes);
    timings.push({
      stopId: stop.id,
      legKm: Number(legKm.toFixed(2)),
      etaMinutesFromStart,
      etaClockTime: minutesToClock(startMinutes + etaMinutesFromStart),
    });
    cumulativeMinutes += stopDwellMinutes;
    prev = stop;
  }
  return timings;
}

function minutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
