// Geographic data for Bandung - Cimahi - Padalarang Railway Corridor
// Accurate GPS coordinates along the actual PT KAI / KCIC double track corridor

export interface StationGeo {
  id: string;
  name: string;
  shortName: string;
  code: string;
  km: string;
  lat: number;
  lng: number;
  type: 'terminal' | 'stop' | 'intermediate' | 'whoosh';
  platformInfo?: string;
  connections?: string[];
  description: string;
}

export const STATIONS_GEO: StationGeo[] = [
  {
    id: 'BDG',
    name: 'Stasiun Bandung',
    shortName: 'Bandung (Hall)',
    code: 'BDG',
    km: 'Km 155+134',
    lat: -6.91262,
    lng: 107.60248,
    type: 'terminal',
    platformInfo: 'Jalur 5 & 6 (Khusus KA Feeder)',
    connections: ['Commuter Line Bandung Raya', 'KA Jarak Jauh', 'Teman Bus'],
    description: 'Stasiun terminus utama wilayah timur KA Feeder Kereta Cepat Whoosh.',
  },
  {
    id: 'CIR',
    name: 'Stasiun Ciroyom',
    shortName: 'Ciroyom',
    code: 'CIR',
    km: 'Km 153+495',
    lat: -6.91420,
    lng: 107.59100,
    type: 'intermediate',
    platformInfo: 'Jalur Langsung (Tidak Berhenti)',
    description: 'Stasiun antara lintasan petak Bandung - Andir.',
  },
  {
    id: 'AND',
    name: 'Stasiun Andir',
    shortName: 'Andir',
    code: 'AND',
    km: 'Km 150+550',
    lat: -6.90800,
    lng: 107.57000,
    type: 'intermediate',
    platformInfo: 'Jalur Langsung (Tidak Berhenti)',
    description: 'Stasiun persinyalan antara petak Ciroyom - Cimindi.',
  },
  {
    id: 'CMD',
    name: 'Stasiun Cimindi',
    shortName: 'Cimindi',
    code: 'CMD',
    km: 'Km 143+648',
    lat: -6.89700,
    lng: 107.55830,
    type: 'intermediate',
    platformInfo: 'Jalur Langsung (Tidak Berhenti)',
    description: 'Stasiun perbatasan Kota Bandung dan Kota Cimahi.',
  },
  {
    id: 'CMI',
    name: 'Stasiun Cimahi',
    shortName: 'Cimahi',
    code: 'CMI',
    km: 'Km 140+472',
    lat: -6.88560,
    lng: 107.53640,
    type: 'stop',
    platformInfo: 'Jalur 1 & 2 (Berhenti 2 Menit)',
    connections: ['Commuter Line Garut/Bdg Raya', 'KA Lokal'],
    description: 'Satu-satunya stasiun pemberhentian antara perjalanan KA Feeder (naik/turun penumpang 2 menit).',
  },
  {
    id: 'GK',
    name: 'Stasiun Gadobangkong',
    shortName: 'Gadobangkong',
    code: 'GK',
    km: 'Km 133+520',
    lat: -6.86240,
    lng: 107.50980,
    type: 'intermediate',
    platformInfo: 'Jalur Langsung (Tidak Berhenti)',
    description: 'Stasiun perhentian KRL/KRD komuter Bandung Raya di Kabupaten Bandung Barat.',
  },
  {
    id: 'PDL',
    name: 'Stasiun Padalarang (KAI)',
    shortName: 'Padalarang KAI',
    code: 'PDL',
    km: 'Km 130+112',
    lat: -6.84190,
    lng: 107.47950,
    type: 'terminal',
    platformInfo: 'Peron KA Feeder (Lantai Dasar)',
    connections: ['Skybridge Whoosh KCIC', 'Commuter Line', 'KA Jarak Jauh'],
    description: 'Stasiun transit integrasi antarmoda KA Feeder dengan Kereta Cepat Whoosh.',
  },
  {
    id: 'KCIC_PDL',
    name: 'Stasiun Whoosh Padalarang',
    shortName: 'Whoosh KCIC',
    code: 'KCIC',
    km: 'Km 130 (Elevated)',
    lat: -6.84075,
    lng: 107.47880,
    type: 'whoosh',
    platformInfo: 'Peron Layang Kereta Cepat',
    connections: ['Skybridge ke Peron KA Feeder KAI'],
    description: 'Stasiun Kereta Cepat Whoosh jalur relasi Halim (Jakarta) ⟷ Padalarang ⟷ Tegalluar.',
  },
];

// Detailed GPS path coordinate points along the actual railway line
// Ordered from Stasiun Bandung (index 0) to Stasiun Padalarang (last index)
export const FEEDER_TRACK_POINTS: [number, number][] = [
  [-6.91262, 107.60248], // Stasiun Bandung (Peron 5/6)
  [-6.91295, 107.59820], // Jl. Pasirkaliki viaduct
  [-6.91420, 107.59100], // Stasiun Ciroyom
  [-6.91350, 107.58550], // Jl. Arjuna
  [-6.91180, 107.57900], // Jl. Rajawali Barat
  [-6.90800, 107.57000], // Stasiun Andir
  [-6.90380, 107.56450], // Cibeureum Utara
  [-6.89700, 107.55830], // Stasiun Cimindi
  [-6.89280, 107.55100], // Flyover Cimindi
  [-6.8890, 107.54350],  // Kelurahan Baros
  [-6.88560, 107.53640], // Stasiun Cimahi
  [-6.88120, 107.52850], // Kelurahan Padasuka
  [-6.87450, 107.52100], // Cihanjuang Bawah
  [-6.86750, 107.51450], // Gadobangkong Timur
  [-6.86240, 107.50980], // Stasiun Gadobangkong
  [-6.85650, 107.50150], // Permata Cimahi
  [-6.84950, 107.49100], // Kertamulya
  [-6.84450, 107.48350], // Tagog Padalarang
  [-6.84190, 107.47950], // Stasiun Padalarang KAI
];

// Connection between KAI Station and Whoosh Elevated Station
export const SKYBRIDGE_COORDINATES: [number, number][] = [
  [-6.84190, 107.47950],
  [-6.84130, 107.47910],
  [-6.84075, 107.47880],
];

// KCIC Whoosh High Speed Viaduct Track (Jakarta - Padalarang - Tegalluar)
export const WHOOSH_TRACK_POINTS: [number, number][] = [
  [-6.83750, 107.44500], // Viaduct Halim/Karawang
  [-6.83920, 107.46200], // Padalarang Barat
  [-6.84075, 107.47880], // Stasiun Whoosh Padalarang
  [-6.84250, 107.49500], // Viaduct Purwakarta-Padalarang
  [-6.84700, 107.52500], // Cimahi Selatan Viaduct
  [-6.85600, 107.56000], // Baros Viaduct
  [-6.87200, 107.60500], // Bandung Selatan
  [-6.91500, 107.66500], // GBLA / Gedebage
  [-6.97400, 107.71400], // Stasiun Tegalluar Summarecon
];

// Index of Cimahi in FEEDER_TRACK_POINTS
export const CIMAHI_TRACK_INDEX = 10;

// Calculate distance between two lat/lng points in meters (Haversine formula)
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate bearing (angle in degrees) between two points
export function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360;
}

// Interpolate coordinate and bearing along a polyline given a progress ratio (0 to 1)
export function interpolateAlongPolyline(
  points: [number, number][],
  progress: number
): { lat: number; lng: number; bearing: number } {
  if (points.length === 0) {
    return { lat: -6.91262, lng: 107.60248, bearing: 0 };
  }
  if (points.length === 1 || progress <= 0) {
    const p1 = points[0];
    const p2 = points[1] || points[0];
    return {
      lat: p1[0],
      lng: p1[1],
      bearing: getBearing(p1[0], p1[1], p2[0], p2[1]),
    };
  }
  if (progress >= 1) {
    const pLast = points[points.length - 1];
    const pPrev = points[points.length - 2] || pLast;
    return {
      lat: pLast[0],
      lng: pLast[1],
      bearing: getBearing(pPrev[0], pPrev[1], pLast[0], pLast[1]),
    };
  }

  // Calculate cumulative distances
  const distances: number[] = [0];
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = getDistanceMeters(
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1]
    );
    totalDistance += d;
    distances.push(totalDistance);
  }

  const targetDist = progress * totalDistance;

  // Find segment
  for (let i = 0; i < distances.length - 1; i++) {
    if (targetDist <= distances[i + 1]) {
      const segStartDist = distances[i];
      const segEndDist = distances[i + 1];
      const segLen = segEndDist - segStartDist;
      const segRatio = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

      const p1 = points[i];
      const p2 = points[i + 1];

      const lat = p1[0] + segRatio * (p2[0] - p1[0]);
      const lng = p1[1] + segRatio * (p2[1] - p1[1]);
      const bearing = getBearing(p1[0], p1[1], p2[0], p2[1]);

      return { lat, lng, bearing };
    }
  }

  const last = points[points.length - 1];
  return { lat: last[0], lng: last[1], bearing: 0 };
}

// Slice points for Bandung -> Cimahi
export const TRACK_BDG_TO_CMI = FEEDER_TRACK_POINTS.slice(0, CIMAHI_TRACK_INDEX + 1);

// Slice points for Cimahi -> Padalarang
export const TRACK_CMI_TO_PDL = FEEDER_TRACK_POINTS.slice(CIMAHI_TRACK_INDEX);

// Reverse for Padalarang -> Cimahi
export const TRACK_PDL_TO_CMI = [...TRACK_CMI_TO_PDL].reverse();

// Reverse for Cimahi -> Bandung
export const TRACK_CMI_TO_BDG = [...TRACK_BDG_TO_CMI].reverse();
