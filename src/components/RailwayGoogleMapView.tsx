import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  Layers,
  Crosshair,
  MapPin,
  Flame,
  Clock,
  Zap,
  Info,
  Navigation,
  Compass,
} from 'lucide-react';
import {
  STATIONS_GEO,
  FEEDER_TRACK_POINTS,
  interpolateAlongPolyline,
  TRACK_BDG_TO_CMI,
  TRACK_CMI_TO_PDL,
  TRACK_PDL_TO_CMI,
  TRACK_CMI_TO_BDG,
  StationGeo,
} from '../data/railwayMapData';

interface RailwayGoogleMapViewProps {
  // Timing parameters
  simClockSec: number;
  t_dep_bdg_sec: number;
  t_arr_cmi_sec: number;
  t_dep_cmi_sec: number;
  t_arr_pdl_sec: number;
  u_dep_pdl_sec: number;
  u_arr_cmi_sec: number;
  u_dep_cmi_sec: number;
  u_arr_bdg_sec: number;
  // Train states
  downTrainState: {
    status: string;
    speed: number;
    currentSegment: string;
    dwellRemainingSec: number;
    etaSec: number;
    trainNo: string;
    whooshNo: string;
  };
  upTrainState: {
    status: string;
    speed: number;
    currentSegment: string;
    dwellRemainingSec: number;
    etaSec: number;
    trainNo: string;
  };
  isPassingEachOther: boolean;
  depWhooshTime: string;
}

export type MapTileStyle = 'google_roadmap' | 'google_satellite' | 'dark_transit';

export const RailwayGoogleMapView: React.FC<RailwayGoogleMapViewProps> = ({
  simClockSec,
  t_dep_bdg_sec,
  t_arr_cmi_sec,
  t_dep_cmi_sec,
  t_arr_pdl_sec,
  u_dep_pdl_sec,
  u_arr_cmi_sec,
  u_dep_cmi_sec,
  u_arr_bdg_sec,
  downTrainState,
  upTrainState,
  isPassingEachOther,
  depWhooshTime,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Markers ref to update positions smoothly
  const downTrainMarkerRef = useRef<L.Marker | null>(null);
  const upTrainMarkerRef = useRef<L.Marker | null>(null);
  const passingMarkerRef = useRef<L.Marker | null>(null);

  const [mapStyle, setMapStyle] = useState<MapTileStyle>('google_roadmap');
  const [followTarget, setFollowTarget] = useState<'none' | 'down' | 'up'>('none');
  const [selectedStation, setSelectedStation] = useState<StationGeo | null>(null);

  // 1. Calculate Down Train Position (Bandung -> Cimahi -> Padalarang)
  const downGeoPos = React.useMemo(() => {
    const t = simClockSec;
    if (t < t_dep_bdg_sec) {
      // Standby at Stasiun Bandung
      const p = STATIONS_GEO[0];
      return { lat: p.lat, lng: p.lng, bearing: 285 };
    }
    if (t < t_arr_cmi_sec) {
      // Running Bandung -> Cimahi
      const legDuration = t_arr_cmi_sec - t_dep_bdg_sec;
      const progress = Math.max(0, Math.min(1, (t - t_dep_bdg_sec) / legDuration));
      return interpolateAlongPolyline(TRACK_BDG_TO_CMI, progress);
    }
    if (t < t_dep_cmi_sec) {
      // Dwell at Stasiun Cimahi
      const p = STATIONS_GEO[4];
      return { lat: p.lat, lng: p.lng, bearing: 300 };
    }
    if (t < t_arr_pdl_sec) {
      // Running Cimahi -> Padalarang
      const legDuration = t_arr_pdl_sec - t_dep_cmi_sec;
      const progress = Math.max(0, Math.min(1, (t - t_dep_cmi_sec) / legDuration));
      return interpolateAlongPolyline(TRACK_CMI_TO_PDL, progress);
    }
    // Arrived at Padalarang
    const p = STATIONS_GEO[6];
    return { lat: p.lat, lng: p.lng, bearing: 305 };
  }, [simClockSec, t_dep_bdg_sec, t_arr_cmi_sec, t_dep_cmi_sec, t_arr_pdl_sec]);

  // 2. Calculate Up Train Position (Padalarang -> Cimahi -> Bandung)
  const upGeoPos = React.useMemo(() => {
    const t = simClockSec;
    if (t < u_dep_pdl_sec) {
      // Standby at Stasiun Padalarang
      const p = STATIONS_GEO[6];
      return { lat: p.lat, lng: p.lng, bearing: 125 };
    }
    if (t < u_arr_cmi_sec) {
      // Running Padalarang -> Cimahi
      const legDuration = u_arr_cmi_sec - u_dep_pdl_sec;
      const progress = Math.max(0, Math.min(1, (t - u_dep_pdl_sec) / legDuration));
      return interpolateAlongPolyline(TRACK_PDL_TO_CMI, progress);
    }
    if (t < u_dep_cmi_sec) {
      // Dwell at Stasiun Cimahi
      const p = STATIONS_GEO[4];
      return { lat: p.lat, lng: p.lng, bearing: 120 };
    }
    if (t < u_arr_bdg_sec) {
      // Running Cimahi -> Bandung
      const legDuration = u_arr_bdg_sec - u_dep_cmi_sec;
      const progress = Math.max(0, Math.min(1, (t - u_dep_cmi_sec) / legDuration));
      return interpolateAlongPolyline(TRACK_CMI_TO_BDG, progress);
    }
    // Arrived at Bandung
    const p = STATIONS_GEO[0];
    return { lat: p.lat, lng: p.lng, bearing: 105 };
  }, [simClockSec, u_dep_pdl_sec, u_arr_cmi_sec, u_dep_cmi_sec, u_arr_bdg_sec]);

  // Fit bounds helper
  const fitCorridorBounds = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const bounds = L.latLngBounds(
      FEEDER_TRACK_POINTS.map(([lat, lng]) => L.latLng(lat, lng))
    );
    mapInstanceRef.current.fitBounds(bounds, {
      padding: [45, 45],
      maxZoom: 14,
      animate: true,
    });
    setFollowTarget('none');
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    // Center approximately between Bandung and Padalarang (around Cimahi)
    const initialCenter: [number, number] = [-6.8856, 107.5400];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 13,
      minZoom: 11,
      maxZoom: 18,
      zoomControl: false, // custom placed
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Add zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial Tile Layer: Google Maps Roadmap
    const googleRoadmapUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    const tileLayer = L.tileLayer(googleRoadmapUrl, {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // ================== DRAW RAILWAY TRACKS (LINES JALAN KERETA) ==================

    // KA Feeder Main Track Corridor (Bandung - Cimahi - Padalarang)
    // Outer black casing (ballast / track bed)
    L.polyline(FEEDER_TRACK_POINTS, {
      color: '#090d16',
      weight: 8,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Glow highlight line
    L.polyline(FEEDER_TRACK_POINTS, {
      color: '#38bdf8',
      weight: 6,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Core railway steel rail track
    L.polyline(FEEDER_TRACK_POINTS, {
      color: '#dc2626', // KCIC Crimson Red
      weight: 4.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Railway Sleeper Ties (Bantalan Rel Kereta Api)
    L.polyline(FEEDER_TRACK_POINTS, {
      color: '#ffffff',
      weight: 3,
      dashArray: '2, 9',
      opacity: 0.95,
    }).addTo(map);

    // ================== STATION PINS & BADGES ==================
    STATIONS_GEO.forEach((st) => {
      let pinHtml = '';

      if (st.type === 'terminal') {
        // Major Terminal Station (Bandung or Padalarang)
        const isBdg = st.id === 'BDG';
        const bgGrad = isBdg
          ? 'from-blue-600 to-indigo-700'
          : 'from-indigo-600 to-purple-800';
        const ringColor = isBdg ? 'ring-blue-400' : 'ring-indigo-400';

        pinHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer -translate-x-1/2 -translate-y-full hover:scale-110 transition-transform duration-200" style="width: 140px;">
            <!-- Station Pill Label -->
            <div class="bg-[#0b1528] text-white border-2 border-${isBdg ? 'blue-400' : 'indigo-400'} px-2.5 py-1 rounded-lg shadow-xl text-center mb-1 flex items-center gap-1.5 backdrop-blur-md">
              <span class="w-2 h-2 rounded-full ${isBdg ? 'bg-blue-400' : 'bg-indigo-400'} animate-ping"></span>
              <span class="font-black text-[10.5px] whitespace-nowrap tracking-wide">${st.name}</span>
            </div>
            <!-- Pin Head -->
            <div class="w-8 h-8 rounded-full bg-gradient-to-br ${bgGrad} flex items-center justify-center text-white shadow-xl ring-2 ${ringColor} border border-white/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
            </div>
            <!-- Pin Pointer -->
            <div class="w-2 h-2 bg-${isBdg ? 'blue-600' : 'indigo-600'} rotate-45 -mt-1 shadow-md"></div>
          </div>
        `;
      } else if (st.type === 'stop') {
        // Cimahi Stop (Berhenti 2 Menit)
        pinHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer -translate-x-1/2 -translate-y-full hover:scale-110 transition-transform duration-200" style="width: 150px;">
            <div class="bg-[#062018] text-emerald-200 border-2 border-emerald-400 px-2.5 py-1 rounded-lg shadow-xl text-center mb-1 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <div class="text-left">
                <div class="font-black text-[10.5px] text-white leading-tight">${st.name}</div>
                <div class="text-[8.5px] text-emerald-300 font-bold leading-none">Berhenti 2 Menit</div>
              </div>
            </div>
            <div class="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-xl ring-2 ring-emerald-300 border border-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="w-2 h-2 bg-emerald-600 rotate-45 -mt-1 shadow-md"></div>
          </div>
        `;
      } else if (st.type === 'whoosh') {
        // Whoosh KCIC Station
        pinHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer -translate-x-1/2 -translate-y-full hover:scale-110 transition-transform duration-200" style="width: 140px;">
            <div class="bg-[#1f092e] text-purple-200 border-2 border-purple-400 px-2 py-1 rounded-lg shadow-xl text-center mb-1">
              <div class="font-black text-[10px] text-purple-100 flex items-center justify-center gap-1">
                <span>🚄 WHOOSH KCIC</span>
              </div>
            </div>
            <div class="w-6 h-6 rounded-full bg-purple-700 flex items-center justify-center text-white ring-2 ring-purple-300 shadow-md text-xs font-black">
              W
            </div>
            <div class="w-1.5 h-1.5 bg-purple-700 rotate-45 -mt-0.5"></div>
          </div>
        `;
      } else {
        // Intermediate Stations (Ciroyom, Andir, Cimindi, Gadobangkong)
        pinHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform" style="width: 80px;">
            <div class="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-amber-400 shadow-md group-hover:scale-125 transition-transform flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
            </div>
            <div class="opacity-80 group-hover:opacity-100 bg-slate-900/90 text-slate-200 border border-slate-700 px-1.5 py-0.5 rounded text-[8.5px] font-bold mt-1 whitespace-nowrap shadow">
              ${st.shortName}
            </div>
          </div>
        `;
      }

      const icon = L.divIcon({
        html: pinHtml,
        className: 'station-custom-marker',
        iconSize: [0, 0],
      });

      const marker = L.marker([st.lat, st.lng], { icon }).addTo(map);

      marker.on('click', () => {
        setSelectedStation(st);
        map.setView([st.lat, st.lng], 15, { animate: true });
      });
    });

    // ================== INITIALIZE TRAIN MARKERS ==================

    // 1. Kereta Arah Padalarang (Hilir) Marker
    const downTrainIcon = L.divIcon({
      html: '<div id="leaflet-marker-train-down"></div>',
      className: 'train-custom-marker',
      iconSize: [0, 0],
    });
    const downMarker = L.marker([downGeoPos.lat, downGeoPos.lng], {
      icon: downTrainIcon,
      zIndexOffset: 1000,
    }).addTo(map);
    downTrainMarkerRef.current = downMarker;

    // 2. Kereta Arah Bandung (Hulu) Marker
    const upTrainIcon = L.divIcon({
      html: '<div id="leaflet-marker-train-up"></div>',
      className: 'train-custom-marker',
      iconSize: [0, 0],
    });
    const upMarker = L.marker([upGeoPos.lat, upGeoPos.lng], {
      icon: upTrainIcon,
      zIndexOffset: 1000,
    }).addTo(map);
    upTrainMarkerRef.current = upMarker;

    // Fit corridor on load
    fitCorridorBounds();

    // Resize observer to ensure Leaflet recalculates dimensions when container expands
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // Run once on mount

  // Handle Map Style Switch
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    let maxZoom = 20;
    let subdomains: string[] | string = ['mt0', 'mt1', 'mt2', 'mt3'];

    if (mapStyle === 'google_satellite') {
      url = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    } else if (mapStyle === 'dark_transit') {
      url = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';
      subdomains = 'abcd';
      maxZoom = 19;
    }

    const newTileLayer = L.tileLayer(url, {
      maxZoom,
      subdomains,
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [mapStyle]);

  // Update Train Markers Position & HTML dynamically on simulation tick
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // 1. Update Kereta Arah Padalarang (Hilir) Marker
    if (downTrainMarkerRef.current) {
      downTrainMarkerRef.current.setLatLng([downGeoPos.lat, downGeoPos.lng]);

      const el = document.getElementById('leaflet-marker-train-down');
      if (el) {
        el.innerHTML = `
          <div class="relative -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer" style="width: 140px; height: 140px; display: flex; align-items: center; justify-content: center;">
            <!-- Outer Pulsing Radar Ring -->
            <div class="absolute w-14 h-14 rounded-full bg-cyan-500/25 animate-ping"></div>
            <div class="absolute w-20 h-20 rounded-full border border-cyan-400/40 animate-pulse"></div>

            <!-- Train Heading Indicator Cone -->
            <div class="absolute w-28 h-28 pointer-events-none transition-transform duration-300" style="transform: rotate(${downGeoPos.bearing}deg);">
              <div class="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[26px] border-b-cyan-400/60 mx-auto -mt-3 filter drop-shadow"></div>
            </div>

            <!-- Train Body Avatar -->
            <div class="relative z-10 w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-indigo-800 border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-cyan-400/40">
              <span class="text-base font-black">🚆</span>
            </div>

            <!-- Floating Status HUD Capsule -->
            <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#040f24] text-white border-2 border-cyan-400 px-2 py-0.5 rounded-full shadow-2xl flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span class="text-[9.5px] font-black tracking-wide text-cyan-200">PDL: ${downTrainState.speed} km/j</span>
            </div>
          </div>
        `;
      }
    }

    // 2. Update Kereta Arah Bandung (Hulu) Marker
    if (upTrainMarkerRef.current) {
      upTrainMarkerRef.current.setLatLng([upGeoPos.lat, upGeoPos.lng]);

      const el = document.getElementById('leaflet-marker-train-up');
      if (el) {
        el.innerHTML = `
          <div class="relative -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer" style="width: 140px; height: 140px; display: flex; align-items: center; justify-content: center;">
            <!-- Outer Pulsing Radar Ring -->
            <div class="absolute w-14 h-14 rounded-full bg-rose-500/25 animate-ping"></div>
            <div class="absolute w-20 h-20 rounded-full border border-rose-400/40 animate-pulse"></div>

            <!-- Train Heading Indicator Cone -->
            <div class="absolute w-28 h-28 pointer-events-none transition-transform duration-300" style="transform: rotate(${upGeoPos.bearing}deg);">
              <div class="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[26px] border-b-rose-400/60 mx-auto -mt-3 filter drop-shadow"></div>
            </div>

            <!-- Train Body Avatar -->
            <div class="relative z-10 w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-600 via-pink-600 to-red-800 border-2 border-white shadow-2xl flex items-center justify-center text-white ring-4 ring-rose-400/40">
              <span class="text-base font-black">🚅</span>
            </div>

            <!-- Floating Status HUD Capsule -->
            <div class="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-[#20050e] text-white border-2 border-rose-400 px-2 py-0.5 rounded-full shadow-2xl flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md">
              <span class="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
              <span class="text-[9.5px] font-black tracking-wide text-rose-200">BDG: ${upTrainState.speed} km/j</span>
            </div>
          </div>
        `;
      }
    }

    // 3. Camera Auto-Follow if enabled
    if (followTarget === 'down') {
      mapInstanceRef.current.panTo([downGeoPos.lat, downGeoPos.lng], {
        animate: true,
        duration: 0.8,
      });
    } else if (followTarget === 'up') {
      mapInstanceRef.current.panTo([upGeoPos.lat, upGeoPos.lng], {
        animate: true,
        duration: 0.8,
      });
    }
  }, [downGeoPos, upGeoPos, downTrainState.speed, upTrainState.speed, followTarget]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border-2 border-blue-700/80 shadow-2xl bg-[#0b1528]">
      {/* Map Control Toolbar Header */}
      <div className="bg-[#050f22]/90 border-b border-blue-800/80 px-4 py-3 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 relative z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow">
            <Navigation className="w-4 h-4 text-cyan-200" />
          </div>
          <div>
            <div className="text-xs font-black text-white flex items-center gap-1.5">
              <span>PETA GOOGLE MAPS KORIDOR KA FEEDER KCIC</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-blue-400/40 text-[9px] font-bold">
                JALUR REL AKTIF
              </span>
            </div>
            <div className="text-[11px] text-blue-200/70">
              Lintasan Rel PT KAI & Whoosh: Stasiun Padalarang ⟷ Stasiun Cimahi ⟷ Stasiun Bandung
            </div>
          </div>
        </div>

        {/* Action Controls: Layer Switcher & Camera Focus */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Layer Selector */}
          <div className="flex items-center bg-[#071329] border border-blue-800 rounded-xl p-1 gap-1 text-xs">
            <button
              onClick={() => setMapStyle('google_roadmap')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mapStyle === 'google_roadmap'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-blue-300 hover:text-white'
              }`}
            >
              🗺️ Google Maps
            </button>
            <button
              onClick={() => setMapStyle('google_satellite')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mapStyle === 'google_satellite'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-blue-300 hover:text-white'
              }`}
            >
              🛰️ Satelit
            </button>
            <button
              onClick={() => setMapStyle('dark_transit')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mapStyle === 'dark_transit'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-blue-300 hover:text-white'
              }`}
            >
              🌙 Dark Mode
            </button>
          </div>

          {/* Quick Camera Navigation buttons */}
          <div className="flex items-center bg-[#071329] border border-blue-800 rounded-xl p-1 gap-1 text-xs">
            <button
              onClick={fitCorridorBounds}
              title="Tampilkan seluruh koridor jalur KA"
              className="px-2.5 py-1 rounded-lg bg-blue-950 hover:bg-blue-900 text-cyan-300 font-bold flex items-center gap-1 transition-all cursor-pointer border border-blue-800/80"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Seluruh Rute</span>
            </button>

            <button
              onClick={() => {
                setFollowTarget(followTarget === 'down' ? 'none' : 'down');
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setView([downGeoPos.lat, downGeoPos.lng], 15, {
                    animate: true,
                  });
                }
              }}
              title="Fokus ke Kereta Arah Padalarang"
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                followTarget === 'down'
                  ? 'bg-cyan-600 text-white border-cyan-300 shadow'
                  : 'bg-blue-950/80 text-cyan-300 border-blue-800 hover:bg-blue-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Lacak Arah PDL</span>
            </button>

            <button
              onClick={() => {
                setFollowTarget(followTarget === 'up' ? 'none' : 'up');
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.setView([upGeoPos.lat, upGeoPos.lng], 15, {
                    animate: true,
                  });
                }
              }}
              title="Fokus ke Kereta Arah Bandung"
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                followTarget === 'up'
                  ? 'bg-rose-600 text-white border-rose-300 shadow'
                  : 'bg-rose-950/40 text-rose-300 border-rose-900 hover:bg-rose-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span>Lacak Arah BDG</span>
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Live Alert Banners overlay over the map */}
      <div className="absolute top-18 left-4 right-4 z-20 pointer-events-none flex flex-col gap-2">
        {/* Persilangan Banner */}
        {isPassingEachOther && (
          <div className="self-center pointer-events-auto px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-2xl animate-bounce border-2 border-amber-200">
            <Flame className="w-4 h-4 fill-slate-950 text-slate-950" />
            <span>PERSILANGAN KERETA! Kedua armada KA Feeder sedang berpapasan di jalur ganda!</span>
          </div>
        )}

        {/* Cimahi Stop Banners */}
        {downTrainState.status === 'DWELL_CMI' && (
          <div className="self-start pointer-events-auto px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-xl animate-pulse border-2 border-emerald-200">
            <Clock className="w-4 h-4 fill-slate-950 text-slate-950" />
            <span>KERETA ARAH PADALARANG BERHENTI DI STASIUN CIMAHI (Sisa Dwell: {downTrainState.dwellRemainingSec}s)</span>
          </div>
        )}

        {upTrainState.status === 'DWELL_CMI' && (
          <div className="self-end pointer-events-auto px-3.5 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-xl animate-pulse border-2 border-teal-200">
            <Clock className="w-4 h-4 fill-slate-950 text-slate-950" />
            <span>KERETA ARAH BANDUNG BERHENTI DI STASIUN CIMAHI (Sisa Dwell: {upTrainState.dwellRemainingSec}s)</span>
          </div>
        )}
      </div>

      {/* Main Map Canvas */}
      <div
        ref={mapContainerRef}
        className="w-full relative z-10"
        style={{ height: '480px', minHeight: '440px' }}
      ></div>

      {/* Map Overlay Bottom Badges: Track Legend & Selected Station Card */}
      <div className="absolute bottom-3 left-3 z-20 pointer-events-none flex flex-col sm:flex-row items-end sm:items-center gap-2">
        {/* Map Legend */}
        <div className="pointer-events-auto bg-[#040e21]/95 border border-blue-700/80 rounded-xl p-2.5 shadow-2xl backdrop-blur-md text-[10.5px] text-white space-y-1.5 max-w-xs">
          <div className="font-bold text-cyan-300 flex items-center gap-1.5 border-b border-blue-800/60 pb-1">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>LEGENDA JALUR REL</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-2 bg-red-600 rounded border border-white flex items-center justify-center">
              <div className="w-full h-0.5 border-t border-dashed border-white"></div>
            </div>
            <span>Jalur Rel KA Feeder (Double Track)</span>
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span>
              <span className="text-[10px] text-cyan-200">Arah Padalarang</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
              <span className="text-[10px] text-rose-200">Arah Bandung</span>
            </div>
          </div>
        </div>

        {/* Selected Station Pop-card (if user clicked station) */}
        {selectedStation && (
          <div className="pointer-events-auto bg-[#071329]/95 border-2 border-cyan-400 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-white max-w-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black text-cyan-300 text-sm flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span>{selectedStation.name}</span>
                </div>
                <div className="text-[10px] text-blue-300 font-mono">
                  Kode: {selectedStation.code} • {selectedStation.km}
                </div>
              </div>
              <button
                onClick={() => setSelectedStation(null)}
                className="text-slate-400 hover:text-white font-black text-sm px-1"
              >
                ✕
              </button>
            </div>
            <p className="text-blue-100/90 text-[11px] mt-1.5">
              {selectedStation.description}
            </p>
            {selectedStation.platformInfo && (
              <div className="mt-1.5 px-2 py-1 bg-blue-950 rounded border border-blue-800 text-[10px] text-emerald-300 font-bold">
                {selectedStation.platformInfo}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
