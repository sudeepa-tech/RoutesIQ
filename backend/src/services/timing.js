import { haversineKm } from './optimizer.js';

/**
 * Realistic school-bus timing model.
 * ------------------------------------------------
 * PICKUP routes must all converge on campus at a fixed arrival time
 * (e.g. 07:15) — buses do NOT leave the depot at a shared start time and
 * arrive whenever; each route's start time is instead worked out
 * BACKWARDS from the required school arrival time, so a bus with more
 * stops or a farther first pickup simply starts earlier.
 *
 * DROP routes are the mirror image: every bus leaves campus together at
 * a fixed departure time (e.g. 14:20) and moves FORWARD through its
 * stops, dropping riders off as it goes.
 *
 * Both use the same straight-line/average-speed estimate as the rest of
 * the optimizer — a planning estimate, not a live-traffic ETA.
 */

const DEFAULT_SPEED_KMH = 28;
const DEFAULT_DWELL_MIN = 1;

/**
 * PICKUP: computes each stop's pickup time and remaining duration to
 * school, such that the bus arrives at the depot at exactly `arrivalTime`.
 */
export function computeArrivalSchedule(
  depot,
  orderedStops,
  { arrivalTime = '07:15', avgSpeedKmh = DEFAULT_SPEED_KMH, stopDwellMinutes = DEFAULT_DWELL_MIN } = {}
) {
  if (!orderedStops.length) return { timings: [], startTime: arrivalTime, arrivalTime };

  const arrivalMinutes = toMinutes(arrivalTime);

  // Pass 1: total route duration from the first stop's pickup to school arrival
  let totalDuration = 0;
  for (let i = 0; i < orderedStops.length; i++) {
    if (i > 0) {
      totalDuration += travelMinutes(orderedStops[i - 1], orderedStops[i], avgSpeedKmh);
    }
    totalDuration += stopDwellMinutes;
  }
  totalDuration += travelMinutes(orderedStops[orderedStops.length - 1], depot, avgSpeedKmh);

  const startMinutes = arrivalMinutes - totalDuration;

  // Pass 2: forward simulate from startMinutes (arrival at the first stop)
  const timings = [];
  let cumulative = 0;
  for (let i = 0; i < orderedStops.length; i++) {
    if (i > 0) {
      cumulative += travelMinutes(orderedStops[i - 1], orderedStops[i], avgSpeedKmh) + stopDwellMinutes;
    }
    const pickupMinutes = startMinutes + cumulative;
    timings.push({
      stopId: orderedStops[i].id,
      pickupTime: minutesToClock(pickupMinutes),
      durationToSchoolMinutes: Math.round(arrivalMinutes - pickupMinutes),
    });
  }

  return { timings, startTime: minutesToClock(startMinutes), arrivalTime };
}

/**
 * DROP: computes each stop's drop-off time and elapsed duration since
 * leaving school, starting from a fixed `departureTime`. Retraces the
 * pickup path in REVERSE (the stop closest to school — picked up last on
 * the morning run — is dropped off first on the afternoon run), which
 * mirrors how a bus physically retraces its road path back out.
 */
export function computeDepartureSchedule(
  depot,
  orderedPickupStops,
  { departureTime = '14:20', avgSpeedKmh = DEFAULT_SPEED_KMH, stopDwellMinutes = DEFAULT_DWELL_MIN } = {}
) {
  const dropStops = [...orderedPickupStops].reverse();
  const departureMinutes = toMinutes(departureTime);
  let cumulative = 0;
  let prev = depot;
  const timings = [];

  for (const stop of dropStops) {
    cumulative += travelMinutes(prev, stop, avgSpeedKmh);
    const dropMinutes = departureMinutes + cumulative;
    timings.push({
      stopId: stop.id,
      dropTime: minutesToClock(dropMinutes),
      durationFromSchoolMinutes: Math.round(cumulative),
    });
    cumulative += stopDwellMinutes;
    prev = stop;
  }

  return { timings, departureTime };
}

function travelMinutes(a, b, avgSpeedKmh) {
  return (haversineKm(a, b) / avgSpeedKmh) * 60;
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToClock(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440; // wrap safely, no negatives
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
