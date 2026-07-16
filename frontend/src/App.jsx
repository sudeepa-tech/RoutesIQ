import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import MobileNav from './components/MobileNav.jsx';
import { TransportDataProvider } from './hooks/useTransportData.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import MapView from './pages/MapView.jsx';
import Optimizer from './pages/Optimizer.jsx';
import Riders from './pages/Riders.jsx';
import Report from './pages/Report.jsx';
import ConsolidationReport from './pages/ConsolidationReport.jsx';
import FleetManagement from './pages/FleetManagement.jsx';
import ImpactedStudentsReport from './pages/ImpactedStudentsReport.jsx';
import SuggestedMap from './pages/SuggestedMap.jsx';
import RouteRoster from './pages/RouteRoster.jsx';

export default function App() {
  return (
    <TransportDataProvider>
      <div className="h-screen w-screen flex bg-base text-ink font-body overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex min-w-0 pb-14 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/optimizer" element={<Optimizer />} />
            <Route path="/riders" element={<Riders />} />
            <Route path="/report" element={<Report />} />
            <Route path="/consolidation" element={<ConsolidationReport />} />
            <Route path="/fleet" element={<FleetManagement />} />
            <Route path="/impacted-students" element={<ImpactedStudentsReport />} />
            <Route path="/suggested-map" element={<SuggestedMap />} />
            <Route path="/route-roster" element={<RouteRoster />} />
          </Routes>
        </div>
        <MobileNav />
      </div>
    </TransportDataProvider>
  );
}
