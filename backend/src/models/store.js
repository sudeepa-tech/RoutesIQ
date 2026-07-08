/**
 * Minimal in-memory data store.
 *
 * This keeps the reference implementation dependency-free and easy to run.
 * For a real production deployment, swap this module for a Postgres/Mongo
 * repository behind the same interface (load/save/getX) so the rest of the
 * codebase (routes, services) doesn't need to change.
 */

let state = {
  vehicles: [],
  stops: [],
  riders: [],
  lastOptimization: null,
  meta: null,
  uploadedAt: null,
};

export const store = {
  setDataset({ vehicles, stops, riders, meta }) {
    state = {
      ...state,
      vehicles,
      stops,
      riders,
      meta,
      uploadedAt: new Date().toISOString(),
      lastOptimization: null,
    };
  },
  getDataset() {
    return {
      vehicles: state.vehicles,
      stops: state.stops,
      riders: state.riders,
      meta: state.meta,
      uploadedAt: state.uploadedAt,
    };
  },
  hasDataset() {
    return state.vehicles.length > 0 && state.stops.length > 0;
  },
  setOptimizationResult(result) {
    state.lastOptimization = { ...result, computedAt: new Date().toISOString() };
  },
  getOptimizationResult() {
    return state.lastOptimization;
  },
  reset() {
    state = {
      vehicles: [],
      stops: [],
      riders: [],
      lastOptimization: null,
      meta: null,
      uploadedAt: null,
    };
  },
};
