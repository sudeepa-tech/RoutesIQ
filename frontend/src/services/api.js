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
  getStops: () => client.get('/riders/stops').then((r) => r.data),
  getRiders: (params) => client.get('/riders', { params }).then((r) => r.data),
  runOptimization: (depot) =>
    client.post('/optimize', depot ? { depot } : {}).then((r) => r.data),
  getLatestOptimization: () => client.get('/optimize/latest').then((r) => r.data),
  runConsolidation: (params) => client.post('/consolidate', params || {}).then((r) => r.data),
};

export default api;
