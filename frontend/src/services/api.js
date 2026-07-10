import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

export const api = {
  uploadWorkbook: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return client
      .post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (onProgress && evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      })
      .then((r) => r.data);
  },
  getStats: () => client.get('/stats').then((r) => r.data),
  getVehicles: () => client.get('/vehicles').then((r) => r.data),
  createVehicle: (data) => client.post('/vehicles', data).then((r) => r.data),
  updateVehicle: (id, data) => client.put(`/vehicles/${id}`, data).then((r) => r.data),
  deleteVehicle: (id) => client.delete(`/vehicles/${id}`),

  getDrivers: () => client.get('/drivers').then((r) => r.data),
  createDriver: (data) => client.post('/drivers', data).then((r) => r.data),
  updateDriver: (id, data) => client.put(`/drivers/${id}`, data).then((r) => r.data),
  deleteDriver: (id) => client.delete(`/drivers/${id}`),

  getStops: () => client.get('/riders/stops').then((r) => r.data),
  getRiders: (params) => client.get('/riders', { params }).then((r) => r.data),
  createRider: (data) => client.post('/riders', data).then((r) => r.data),
  updateRider: (id, data) => client.put(`/riders/${id}`, data).then((r) => r.data),
  deleteRider: (id) => client.delete(`/riders/${id}`),

  getSettings: () => client.get('/settings').then((r) => r.data),
  updateSettings: (data) => client.put('/settings', data).then((r) => r.data),

  runOptimization: (params) => client.post('/optimize', params || {}).then((r) => r.data),
  getLatestOptimization: () => client.get('/optimize/latest').then((r) => r.data),
  runConsolidation: (params) => client.post('/consolidate', params || {}).then((r) => r.data),
  getImpactedStudents: () => client.get('/reports/impacted-students').then((r) => r.data),
};

export default api;
