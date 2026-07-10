import { useEffect, useState, useCallback } from 'react';
import { Bus, UserSquare2, Users } from 'lucide-react';
import Topbar from '../components/Topbar.jsx';
import CrudTable from '../components/CrudTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useTransportData } from '../hooks/useTransportData.jsx';
import api from '../services/api.js';

const SUBTABS = [
  { id: 'vehicles', label: 'Vehicles', icon: Bus },
  { id: 'drivers', label: 'Drivers', icon: UserSquare2 },
  { id: 'students', label: 'Students & Staff', icon: Users },
];

export default function FleetManagement() {
  const { stats, refreshStats, refreshVehiclesAndStops } = useTransportData();
  const [subtab, setSubtab] = useState('vehicles');
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d, r] = await Promise.all([api.getVehicles(), api.getDrivers(), api.getRiders()]);
      setVehicles(v.vehicles);
      setDrivers(d.drivers);
      setRiders(r.riders.slice(0, 300)); // cap for table performance; searchable Riders page has full list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStats().catch(() => {});
    loadAll();
  }, [refreshStats, loadAll]);

  if (!stats?.datasetLoaded) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title="Fleet Management" subtitle="Vehicles, drivers & students" />
        <EmptyState />
      </div>
    );
  }

  const afterVehicleChange = async () => {
    await loadAll();
    await refreshVehiclesAndStops();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <Topbar title="Fleet Management" subtitle="Add, edit, or remove vehicles, drivers, and riders" />
      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          {SUBTABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSubtab(id)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition ${
                subtab === id
                  ? 'bg-panel2 text-ink border-border'
                  : 'text-ink-muted border-transparent hover:text-ink hover:bg-panel2/50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="panel p-8 text-center text-ink-muted text-sm">Loading…</div>
        ) : subtab === 'vehicles' ? (
          <CrudTable
            columns={[
              { key: 'routeNo', label: 'Route No' },
              { key: 'vehicleNo', label: 'Vehicle No' },
              { key: 'capacity', label: 'Capacity', type: 'number' },
              { key: 'startPoint', label: 'Start Point' },
            ]}
            rows={vehicles}
            onCreate={async (values) => {
              await api.createVehicle(values);
              await afterVehicleChange();
            }}
            onUpdate={async (id, values) => {
              await api.updateVehicle(id, values);
              await afterVehicleChange();
            }}
            onDelete={async (id) => {
              await api.deleteVehicle(id);
              await afterVehicleChange();
            }}
            emptyLabel="No vehicles yet — add one to get started"
          />
        ) : subtab === 'drivers' ? (
          <CrudTable
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'phone', label: 'Phone' },
              { key: 'licenseNo', label: 'License No' },
              {
                key: 'assignedVehicleId',
                label: 'Assigned Vehicle',
                type: 'select',
                options: ['', ...vehicles.map((v) => v.id)],
                render: (val) => vehicles.find((v) => v.id === val)?.routeNo ?? '—',
              },
            ]}
            rows={drivers}
            onCreate={async (values) => {
              await api.createDriver(values);
              await loadAll();
            }}
            onUpdate={async (id, values) => {
              await api.updateDriver(id, values);
              await loadAll();
            }}
            onDelete={async (id) => {
              await api.deleteDriver(id);
              await loadAll();
            }}
            emptyLabel="No drivers yet — add one to get started"
          />
        ) : (
          <>
            <p className="text-xs text-ink-muted">
              Showing the first 300 of {stats.riders.toLocaleString()} riders. Use the Riders page to search the full list.
            </p>
            <CrudTable
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'classOrDesignation', label: 'Class / Role' },
                { key: 'userType', label: 'Type', type: 'select', options: ['Student', 'Staff'] },
                { key: 'pickStop', label: 'Pick Stop' },
                { key: 'lat', label: 'Lat', type: 'number' },
                { key: 'lng', label: 'Lng', type: 'number' },
              ]}
              rows={riders}
              onCreate={async (values) => {
                await api.createRider(values);
                await afterVehicleChange();
              }}
              onUpdate={async (id, values) => {
                await api.updateRider(id, values);
                await afterVehicleChange();
              }}
              onDelete={async (id) => {
                await api.deleteRider(id);
                await afterVehicleChange();
              }}
              emptyLabel="No riders yet — add one to get started"
            />
          </>
        )}
      </div>
    </div>
  );
}
