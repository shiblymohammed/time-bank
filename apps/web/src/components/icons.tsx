import React from 'react';

/** Stroke icons drawn on a 24px grid; they take the surrounding text colour. */
const paths = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z',
  organizations:
    'M4 20V6l8-3 8 3v14M9 20v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M2 20h20',
  memberships:
    'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  requests:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14l2 2 4-4',
  catalogue:
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  operations: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  restrictions: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12h6',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  phoneRecovery: 'M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM11 18h2',
  closures:
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3l4 4M21 3l-4 4',
  safety: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8v4M12 16h.01',
  complaints: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v4M12 14h.01',
  audit: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  users: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'M20 6 9 17l-5-5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  close: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  crown: 'M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18',
  lightning: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className,
  size = 18,
}: {
  name: IconName;
  className?: string;
  size?: number | string;
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** Authentic 24-spoke Ashoka Chakra of the Republic of India */
export function AshokaChakra({
  size = 40,
  className,
  color = 'currentColor',
}: {
  size?: number | string;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-label="Ashoka Chakra"
      role="img"
    >
      {/* Outer rim */}
      <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="1" opacity="0.65" />

      {/* Hub */}
      <circle cx="50" cy="50" r="8" fill="none" stroke={color} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="3.5" fill={color} />

      {/* 24 Spokes */}
      {Array.from({ length: 24 }).map((_, i) => (
        <g key={i} transform={`rotate(${i * 15} 50 50)`}>
          <polygon
            points="49.1,50 49.4,12 50,8 50.6,12 50.9,50"
            fill={color}
          />
          <circle cx="50" cy="5.5" r="1.6" fill={color} />
        </g>
      ))}
    </svg>
  );
}

/** Indian Time Bank official emblem with crisp 24-spoke Ashoka Chakra */
export function BrandMark({ size = 40 }: { size?: number | string }) {
  return (
    <div className="brandmark-composite" style={{ position: 'relative', width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <defs>
          <radialGradient id="chakraBackglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0, 82, 255, 0.25)" />
            <stop offset="100%" stopColor="rgba(0, 82, 255, 0)" />
          </radialGradient>
        </defs>

        {/* Soft radial glow */}
        <circle cx="50" cy="50" r="48" fill="url(#chakraBackglow)" />

        {/* Outer rim */}
        <circle cx="50" cy="50" r="45" fill="none" stroke="#0052FF" strokeWidth="2.8" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="#0052FF" strokeWidth="0.9" opacity="0.6" />

        {/* Hub */}
        <circle cx="50" cy="50" r="8" fill="none" stroke="#0052FF" strokeWidth="2.2" />
        <circle cx="50" cy="50" r="3.5" fill="#0052FF" />

        {/* 24 Spokes */}
        {Array.from({ length: 24 }).map((_, i) => (
          <g key={i} transform={`rotate(${i * 15} 50 50)`}>
            <polygon
              points="49.1,50 49.4,14 50,10 50.6,14 50.9,50"
              fill="#0052FF"
            />
            <circle cx="50" cy="7.2" r="1.5" fill="#0052FF" />
          </g>
        ))}
      </svg>
    </div>
  );
}
