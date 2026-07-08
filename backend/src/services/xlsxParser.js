import XLSX from 'xlsx';

/**
 * Parses the institute's transport workbook.
 * Expected sheets:
 *   Sheet1                 -> vehicle/route master (Rt.Nos, Veh.Nos, Seat Cap, Starting Point, ...)
 *   Stu.latlong details    -> rider list (Name, Class/Designation, Pick Stop, User Type, latitude, Longitude)
 *
 * Sheet names are matched fuzzily (case-insensitive substring) so minor
 * naming drift between school exports doesn't break ingestion.
 */
export function parseTransportWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const vehicleSheetName = findSheet(wb, ['sheet1', 'vehicle', 'route']);
  const riderSheetName = findSheet(wb, ['latlong', 'student', 'rider']);

  if (!vehicleSheetName || !riderSheetName) {
    throw new Error(
      'Workbook must contain a vehicle/route sheet and a rider lat/long sheet'
    );
  }

  const vehicles = parseVehicleSheet(wb.Sheets[vehicleSheetName]);
  const { stops, riders } = parseRiderSheet(wb.Sheets[riderSheetName]);

  return { vehicles, stops, riders, meta: { vehicleSheetName, riderSheetName } };
}

function findSheet(wb, keywords) {
  return wb.SheetNames.find((name) =>
    keywords.some((k) => name.toLowerCase().includes(k))
  );
}

function parseVehicleSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  // header row is the first row containing "Rt.Nos" (row 0 is often a merged title)
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => typeof c === 'string' && c.toLowerCase().includes('rt.no'))
  );
  const dataRows = rows.slice(headerIdx + 1);

  const vehicles = [];
  for (const row of dataRows) {
    const [routeNo, vehNo, seatCap, startPoint, startLatLng, endPoint, endLatLng, distance] = row;
    if (!routeNo || !vehNo) continue;
    const start = parseLatLng(startLatLng);
    vehicles.push({
      id: String(routeNo).trim(),
      routeNo: String(routeNo).trim(),
      vehicleNo: String(vehNo).trim(),
      capacity: Number(seatCap) || 0,
      startPoint: startPoint ?? null,
      startLat: start?.lat ?? null,
      startLng: start?.lng ?? null,
      endPoint: endPoint ?? null,
      referenceDistanceKm: typeof distance === 'number' ? distance : null,
    });
  }
  return vehicles;
}

function parseRiderSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => typeof c === 'string' && c.toLowerCase().includes('adm no'))
  );
  const dataRows = rows.slice(headerIdx + 1);

  const riders = [];
  const stopMap = new Map();

  for (const row of dataRows) {
    const [sl, admNo, name, cls, pickStop, dropStop, userType, lat, lng] = row;
    if (!name || lat == null || lng == null) continue;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;

    riders.push({
      id: admNo ?? `R${sl}`,
      name: String(name).trim(),
      classOrDesignation: cls ?? null,
      pickStop: pickStop ?? 'Unknown Stop',
      dropStop: dropStop ?? pickStop ?? 'Unknown Stop',
      userType: userType ?? 'Student',
      lat: latitude,
      lng: longitude,
    });

    // aggregate riders sharing (near-)identical coordinates into one stop
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (!stopMap.has(key)) {
      stopMap.set(key, {
        id: key,
        label: pickStop ?? 'Unknown Stop',
        lat: latitude,
        lng: longitude,
        headcount: 0,
        riderIds: [],
      });
    }
    const stop = stopMap.get(key);
    stop.headcount += 1;
    stop.riderIds.push(admNo ?? name);
  }

  return { stops: Array.from(stopMap.values()), riders };
}

function parseLatLng(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(',').map((v) => parseFloat(v.trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return { lat: parts[0], lng: parts[1] };
}
