import { createContext, useCallback, useContext, useState } from 'react';
import api from '../services/api.js';

const TransportDataContext = createContext(null);

export function TransportDataProvider({ children }) {
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [stops, setStops] = useState([]);
  const [optimization, setOptimization] = useState(null);
  const [consolidation, setConsolidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
      return data;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      throw err;
    }
  }, []);

  const refreshVehiclesAndStops = useCallback(async () => {
    const [v, s] = await Promise.all([api.getVehicles(), api.getStops()]);
    setVehicles(v.vehicles);
    setStops(s.stops);
  }, []);

  const uploadWorkbook = useCallback(
    async (file, onProgress) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.uploadWorkbook(file, onProgress);
        await Promise.all([refreshStats(), refreshVehiclesAndStops()]);
        return result;
      } catch (err) {
        setError(err.response?.data?.error?.message || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refreshStats, refreshVehiclesAndStops]
  );

  const runOptimization = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.runOptimization(params);
      setOptimization(result);
      return result;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const runConsolidation = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.runConsolidation(params);
      setConsolidation(result);
      return result;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    stats,
    vehicles,
    stops,
    optimization,
    consolidation,
    loading,
    error,
    refreshStats,
    refreshVehiclesAndStops,
    uploadWorkbook,
    runOptimization,
    runConsolidation,
  };

  return (
    <TransportDataContext.Provider value={value}>
      {children}
    </TransportDataContext.Provider>
  );
}

export function useTransportData() {
  const ctx = useContext(TransportDataContext);
  if (!ctx) throw new Error('useTransportData must be used within TransportDataProvider');
  return ctx;
}
