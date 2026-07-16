import { randomUUID } from 'crypto';
import { loadPersisted, persist } from '../services/persistence.js';

/**
 * In-memory store, persisted to backend/data/store.json on every mutation
 * (debounced) and reloaded on process start — so an uploaded workbook and
 * any manual edits survive a server restart without needing a real DB.
 *
 * Swap this module for a Postgres/Mongo repository behind the same
 * interface for a multi-instance production deployment; nothing else in
 * the codebase needs to change.
 */

const persisted = loadPersisted();

let state = persisted ?? {
  vehicles: [],
  drivers: [],
  riders: [],
  lastOptimization: null,
  lastConsolidation: null,
  meta: null,
  uploadedAt: null,
  settings: {
    targetUtilizationPct: 100, // global cap; never exceeds real seat capacity regardless
    schoolArrivalTime: '07:15', // every pickup route must reach campus at this time
    schoolDepartureTime: '14:20', // every drop route leaves campus at this time
    avgSpeedKmh: 28,
    maxRideDurationMinutes: 105, // no pickup earlier than 05:30 given the fixed 07:15 arrival
    maxMergeDistanceKm: 12, // hard cap — routes/stops never merge or reassign beyond this
  },
};

function save() {
  persist(state);
}

/** Recompute aggregated geo-stops from the current rider list. */
function recomputeStops() {
  const stopMap = new Map();
  for (const r of state.riders) {
    const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    if (!stopMap.has(key)) {
      stopMap.set(key, { id: key, label: r.pickStop, lat: r.lat, lng: r.lng, headcount: 0, riderIds: [] });
    }
    const stop = stopMap.get(key);
    stop.headcount += 1;
    stop.riderIds.push(r.id);
  }
  state.stopsCache = Array.from(stopMap.values());
}

export const store = {
  // ---------- dataset ingestion ----------
  setDataset({ vehicles, stops, riders, meta }) {
    state = {
      ...state,
      vehicles: vehicles.map((v) => ({ ...v, id: v.id || randomUUID() })),
      riders: riders.map((r) => ({ ...r, id: r.id || randomUUID() })),
      meta,
      uploadedAt: new Date().toISOString(),
      lastOptimization: null,
      lastConsolidation: null,
    };
    recomputeStops();
    save();
  },
  getDataset() {
    return {
      vehicles: state.vehicles,
      stops: state.stopsCache || [],
      riders: state.riders,
      drivers: state.drivers,
      meta: state.meta,
      uploadedAt: state.uploadedAt,
    };
  },
  hasDataset() {
    return state.vehicles.length > 0 && (state.stopsCache || []).length > 0;
  },
  reset() {
    state = {
      vehicles: [],
      drivers: [],
      riders: [],
      lastOptimization: null,
      lastConsolidation: null,
      meta: null,
      uploadedAt: null,
      settings: state.settings,
    };
    recomputeStops();
    save();
  },

  // ---------- settings ----------
  getSettings() {
    return state.settings;
  },
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    save();
    return state.settings;
  },

  // ---------- vehicles CRUD ----------
  addVehicle(vehicle) {
    const record = { id: randomUUID(), routeNo: vehicle.routeNo, vehicleNo: vehicle.vehicleNo,
      capacity: Number(vehicle.capacity), startPoint: vehicle.startPoint ?? null,
      startLat: vehicle.startLat ?? null, startLng: vehicle.startLng ?? null,
      endPoint: vehicle.endPoint ?? null, referenceDistanceKm: vehicle.referenceDistanceKm ?? null };
    state.vehicles.push(record);
    save();
    return record;
  },
  updateVehicle(id, patch) {
    const idx = state.vehicles.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    state.vehicles[idx] = { ...state.vehicles[idx], ...patch, id };
    save();
    return state.vehicles[idx];
  },
  deleteVehicle(id) {
    const before = state.vehicles.length;
    state.vehicles = state.vehicles.filter((v) => v.id !== id);
    state.drivers = state.drivers.map((d) => (d.assignedVehicleId === id ? { ...d, assignedVehicleId: null } : d));
    save();
    return state.vehicles.length < before;
  },

  // ---------- drivers CRUD ----------
  getDrivers() {
    return state.drivers;
  },
  addDriver(driver) {
    const record = { id: randomUUID(), name: driver.name, phone: driver.phone ?? null,
      licenseNo: driver.licenseNo ?? null, assignedVehicleId: driver.assignedVehicleId ?? null };
    state.drivers.push(record);
    save();
    return record;
  },
  updateDriver(id, patch) {
    const idx = state.drivers.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    state.drivers[idx] = { ...state.drivers[idx], ...patch, id };
    save();
    return state.drivers[idx];
  },
  deleteDriver(id) {
    const before = state.drivers.length;
    state.drivers = state.drivers.filter((d) => d.id !== id);
    save();
    return state.drivers.length < before;
  },

  // ---------- riders (students/staff) CRUD ----------
  addRider(rider) {
    const record = { id: randomUUID(), name: rider.name, classOrDesignation: rider.classOrDesignation ?? null,
      pickStop: rider.pickStop, dropStop: rider.dropStop ?? rider.pickStop, userType: rider.userType ?? 'Student',
      lat: Number(rider.lat), lng: Number(rider.lng) };
    state.riders.push(record);
    recomputeStops();
    save();
    return record;
  },
  updateRider(id, patch) {
    const idx = state.riders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    state.riders[idx] = { ...state.riders[idx], ...patch, id };
    recomputeStops();
    save();
    return state.riders[idx];
  },
  deleteRider(id) {
    const before = state.riders.length;
    state.riders = state.riders.filter((r) => r.id !== id);
    recomputeStops();
    save();
    return state.riders.length < before;
  },

  // ---------- optimization / consolidation results ----------
  setOptimizationResult(result) {
    state.lastOptimization = { ...result, computedAt: new Date().toISOString() };
    save();
  },
  getOptimizationResult() {
    return state.lastOptimization;
  },
  setConsolidationResult(result) {
    state.lastConsolidation = { ...result, computedAt: new Date().toISOString() };
    save();
  },
  getConsolidationResult() {
    return state.lastConsolidation;
  },
};

recomputeStops();
