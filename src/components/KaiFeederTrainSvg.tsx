import React from 'react';

interface KaiFeederTrainSvgProps {
  className?: string;
  style?: React.CSSProperties;
  showHeadlight?: boolean;
  status?: 'GATE_OPEN' | 'GATE_CLOSED';
}

/**
 * Authentic vector illustration of KAI Commuter / Feeder KCIC Whoosh train
 * Matching the exact green & white aerodynamic 4-car consist from user illustration (1791895597085.jpg).
 * Configured facing LEFT to rush smoothly from right to left across the table row.
 */
export const KaiFeederTrainSvg: React.FC<KaiFeederTrainSvgProps> = ({
  className = 'h-10 w-auto',
  style,
  showHeadlight = true,
  status = 'GATE_OPEN',
}) => {
  const isClosed = status === 'GATE_CLOSED';

  return (
    <svg
      viewBox="0 0 1450 95"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Headlight beam gradient pointing left (Green/Open mode) */}
        <linearGradient id="headlightBeam" x1="1" y1="0.5" x2="0" y2="0.5">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
          <stop offset="40%" stopColor="#fef08a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
        </linearGradient>

        {/* Red warning beam gradient pointing left (Gate Closed mode) */}
        <linearGradient id="redHeadlightBeam" x1="1" y1="0.5" x2="0" y2="0.5">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>

        {/* Train window tint */}
        <linearGradient id="windowGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="60%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>

        {/* Windshield glare */}
        <linearGradient id="windshieldGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#0284c7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.95" />
        </linearGradient>

        {/* Roof gradient */}
        <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>

        {/* Wheel metal gradient */}
        <radialGradient id="wheelMetal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="60%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Headlight forward beam projection (Left facing - Golden on Open, Intense Crimson on Close) */}
      {showHeadlight && (
        isClosed ? (
          <g>
            <polygon
              points="80,48 0,10 0,80 80,56"
              fill="url(#redHeadlightBeam)"
              className="opacity-90"
            />
            {/* Glowing Red Marker Tail / Headlight on Closed */}
            <circle cx="56" cy="54" r="5" fill="#f43f5e" className="filter drop-shadow-[0_0_10px_#f43f5e]" />
            <circle cx="56" cy="54" r="2.5" fill="#ffffff" />
          </g>
        ) : (
          <polygon
            points="80,48 0,15 0,75 80,56"
            fill="url(#headlightBeam)"
            className="opacity-75"
          />
        )
      )}

      {/* Rail track beneath the train */}
      <rect x="0" y="86" width="1450" height="4" fill="#475569" rx="1" />
      <rect x="0" y="90" width="1450" height="3" fill="#1e293b" />
      {/* Rail gravel / sleeper ties */}
      {Array.from({ length: 48 }).map((_, i) => (
        <rect
          key={i}
          x={i * 30 + 5}
          y="88"
          width="16"
          height="6"
          fill="#334155"
          rx="1"
          opacity="0.8"
        />
      ))}

      {/* ============================================================== */}
      {/* CAR 1: LEADING CAB CAR (Left Facing Aerodynamic Nose) */}
      {/* ============================================================== */}
      <g id="car-1">
        {/* Bogies & Wheels Car 1 */}
        {/* Front Bogie */}
        <g transform="translate(130, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        {/* Rear Bogie */}
        <g transform="translate(310, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>

        {/* Undercarriage equipment boxes */}
        <rect x="180" y="74" width="90" height="7" fill="#0f172a" rx="1" />

        {/* Roof equipment */}
        <rect x="150" y="16" width="40" height="4" fill="url(#roofGrad)" rx="1" />
        <rect x="290" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />

        {/* Main Body Shell Car 1 */}
        <path
          d="M 370 20
             L 140 20
             C 105 20, 80 32, 60 52
             L 50 63
             C 45 68, 50 74, 58 74
             L 370 74
             Z"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.2"
        />

        {/* Aerodynamic Green Nose Cap */}
        <path
          d="M 135 20
             C 100 21, 75 33, 56 53
             L 48 64
             C 44 69, 48 74, 56 74
             L 125 74
             C 115 65, 110 50, 115 35
             C 118 28, 125 22, 135 20
             Z"
          fill="#009639"
        />

        {/* Nose Lower Green Stripe Accent */}
        <path
          d="M 52 68
             L 370 68
             L 370 72
             L 55 72
             Z"
          fill="#009639"
        />
        {/* Dark Lower Skirt Line */}
        <rect x="60" y="72" width="310" height="2" fill="#1e293b" />

        {/* Upper Green Livery Stripe */}
        <path
          d="M 130 22
             L 370 22
             L 370 26
             L 128 26
             Z"
          fill="#009639"
        />

        {/* Front Windshield Glass */}
        <path
          d="M 68 50
             C 80 36, 95 30, 115 28
             L 115 45
             L 78 54
             Z"
          fill="url(#windshieldGlass)"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
        {/* Front Headlight Housing */}
        <circle cx="56" cy="62" r="4.5" fill="#facc15" stroke="#ffffff" strokeWidth="1" />
        <circle cx="56" cy="62" r="2" fill="#ffffff" />

        {/* Cab Door */}
        <rect x="135" y="32" width="22" height="40" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <rect x="139" y="36" width="14" height="15" fill="url(#windowGlass)" rx="1.5" />

        {/* Passenger Door Double */}
        <rect x="320" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="336" y1="30" x2="336" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="323" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="339" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* Passenger Windows */}
        <rect x="175" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="215" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="255" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />

        {/* KAI Logo on Car 1 */}
        <g transform="translate(175, 60)">
          <text x="0" y="5" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="7" fill="#003876">
            KAI
          </text>
          <path d="M 14 -1 L 18 5 L 16 5 L 12 -1 Z" fill="#f97316" />
        </g>
      </g>

      {/* Gangway Bellows 1-2 */}
      <rect x="370" y="25" width="10" height="47" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <line x1="375" y1="25" x2="375" y2="72" stroke="#64748b" strokeWidth="1" />

      {/* ============================================================== */}
      {/* CAR 2: INTERMEDIATE COACH */}
      {/* ============================================================== */}
      <g id="car-2">
        {/* Bogies */}
        <g transform="translate(435, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <g transform="translate(675, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <rect x="495" y="74" width="120" height="7" fill="#0f172a" rx="1" />

        {/* Roof AC */}
        <rect x="430" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />
        <rect x="620" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />

        {/* Body Car 2 */}
        <rect x="380" y="20" width="350" height="54" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />

        {/* Stripes */}
        <rect x="380" y="22" width="350" height="4" fill="#009639" />
        <rect x="380" y="68" width="350" height="4" fill="#009639" />
        <rect x="380" y="72" width="350" height="2" fill="#1e293b" />

        {/* Left Double Door */}
        <rect x="395" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="411" y1="30" x2="411" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="398" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="414" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* Windows */}
        <rect x="440" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="485" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="530" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="635" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />

        {/* Right Double Door */}
        <rect x="685" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="701" y1="30" x2="701" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="688" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="704" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* KAI Logo on Car 2 */}
        <g transform="translate(580, 60)">
          <text x="0" y="5" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="7" fill="#003876">
            KAI
          </text>
          <path d="M 14 -1 L 18 5 L 16 5 L 12 -1 Z" fill="#f97316" />
        </g>
      </g>

      {/* Gangway Bellows 2-3 */}
      <rect x="730" y="25" width="10" height="47" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <line x1="735" y1="25" x2="735" y2="72" stroke="#64748b" strokeWidth="1" />

      {/* ============================================================== */}
      {/* CAR 3: INTERMEDIATE COACH */}
      {/* ============================================================== */}
      <g id="car-3">
        {/* Bogies */}
        <g transform="translate(795, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <g transform="translate(1035, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <rect x="855" y="74" width="120" height="7" fill="#0f172a" rx="1" />

        {/* Roof AC */}
        <rect x="790" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />
        <rect x="980" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />

        {/* Body Car 3 */}
        <rect x="740" y="20" width="350" height="54" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />

        {/* Stripes */}
        <rect x="740" y="22" width="350" height="4" fill="#009639" />
        <rect x="740" y="68" width="350" height="4" fill="#009639" />
        <rect x="740" y="72" width="350" height="2" fill="#1e293b" />

        {/* Left Double Door */}
        <rect x="755" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="771" y1="30" x2="771" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="758" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="774" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* Windows */}
        <rect x="800" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="845" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="945" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="990" y="36" width="34" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />

        {/* Right Double Door */}
        <rect x="1045" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="1061" y1="30" x2="1061" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="1048" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="1064" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* KAI Logo on Car 3 */}
        <g transform="translate(895, 60)">
          <text x="0" y="5" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="7" fill="#003876">
            KAI
          </text>
          <path d="M 14 -1 L 18 5 L 16 5 L 12 -1 Z" fill="#f97316" />
        </g>
      </g>

      {/* Gangway Bellows 3-4 */}
      <rect x="1090" y="25" width="10" height="47" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <line x1="1095" y1="25" x2="1095" y2="72" stroke="#64748b" strokeWidth="1" />

      {/* ============================================================== */}
      {/* CAR 4: TRAILING CAB CAR (Right Facing Aerodynamic Nose) */}
      {/* ============================================================== */}
      <g id="car-4">
        {/* Bogies */}
        <g transform="translate(1155, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <g transform="translate(1335, 72)">
          <rect x="-35" y="4" width="70" height="6" fill="#1e293b" rx="2" />
          <circle cx="-22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="-22" cy="11" r="3" fill="#cbd5e1" />
          <circle cx="22" cy="11" r="9" fill="url(#wheelMetal)" stroke="#0f172a" strokeWidth="2" />
          <circle cx="22" cy="11" r="3" fill="#cbd5e1" />
        </g>
        <rect x="1215" y="74" width="90" height="7" fill="#0f172a" rx="1" />

        {/* Roof Equipment */}
        <rect x="1150" y="16" width="55" height="4" fill="url(#roofGrad)" rx="1" />
        <rect x="1290" y="16" width="40" height="4" fill="url(#roofGrad)" rx="1" />

        {/* Body Car 4 */}
        <path
          d="M 1100 20
             L 1330 20
             C 1365 20, 1390 32, 1410 52
             L 1420 63
             C 1425 68, 1420 74, 1412 74
             L 1100 74
             Z"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.2"
        />

        {/* Rear Aerodynamic Green Nose Cap */}
        <path
          d="M 1335 20
             C 1370 21, 1395 33, 1414 53
             L 1422 64
             C 1426 69, 1422 74, 1414 74
             L 1345 74
             C 1355 65, 1360 50, 1355 35
             C 1352 28, 1345 22, 1335 20
             Z"
          fill="#009639"
        />

        {/* Stripes */}
        <rect x="1100" y="22" width="235" height="4" fill="#009639" />
        <rect x="1100" y="68" width="315" height="4" fill="#009639" />
        <rect x="1100" y="72" width="310" height="2" fill="#1e293b" />

        {/* Rear Windshield */}
        <path
          d="M 1402 50
             C 1390 36, 1375 30, 1355 28
             L 1355 45
             L 1392 54
             Z"
          fill="url(#windshieldGlass)"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
        {/* Red Taillights */}
        <circle cx="1414" cy="62" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.8" />

        {/* Passenger Door Double */}
        <rect x="1115" y="30" width="32" height="43" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <line x1="1131" y1="30" x2="1131" y2="73" stroke="#94a3b8" strokeWidth="1" />
        <rect x="1118" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />
        <rect x="1134" y="35" width="10" height="20" fill="url(#windowGlass)" rx="1.5" />

        {/* Windows */}
        <rect x="1160" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="1200" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />
        <rect x="1240" y="36" width="32" height="18" fill="url(#windowGlass)" rx="2" stroke="#1e293b" strokeWidth="0.8" />

        {/* Cab Door */}
        <rect x="1310" y="32" width="22" height="40" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" rx="1" />
        <rect x="1314" y="36" width="14" height="15" fill="url(#windowGlass)" rx="1.5" />

        {/* KAI Logo on Car 4 */}
        <g transform="translate(1200, 60)">
          <text x="0" y="5" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="7" fill="#003876">
            KAI
          </text>
          <path d="M 14 -1 L 18 5 L 16 5 L 12 -1 Z" fill="#f97316" />
        </g>
      </g>
    </svg>
  );
};
