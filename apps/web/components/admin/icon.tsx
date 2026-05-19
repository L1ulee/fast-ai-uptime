// Inline SVG icon library copied verbatim from Claude Design admin-shell.jsx.
// Renders a 24x24 viewBox; path string(s) are stroked with currentColor.

export const ICONS: Record<string, string | string[]> = {
  dashboard: ['M3 13h8V3H3z', 'M13 21h8V11h-8z', 'M3 21h8v-6H3z', 'M13 9h8V3h-8z'],
  components: ['M3 7l9-4 9 4-9 4-9-4z', 'M3 12l9 4 9-4', 'M3 17l9 4 9-4'],
  incidents: [
    'M12 9v4',
    'M12 17h.01',
    'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  ],
  maint: [
    'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  ],
  ann: ['M3 11l18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 11-5.8-1.6'],
  webhook: [
    'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2',
    'M7.46 19.96A4 4 0 0 1 4 14a4 4 0 0 1 1.07-2.74L7.5 8.5',
    'M16 12c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4z',
    'M14.5 14.5l4.43 4.06A2 2 0 0 1 17 22a2 2 0 0 1-2-2',
  ],
  globe: [
    'M12 2a10 10 0 100 20 10 10 0 000-20z',
    'M2 12h20',
    'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10',
    'M12 2a15.3 15.3 0 00-4 10 15.3 15.3 0 004 10',
  ],
  search: ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'M21 21l-4.3-4.3'],
  settings: [
    'M12 15a3 3 0 100-6 3 3 0 000 6z',
    'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: [
    'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7',
    'M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  ],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6',
    'M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2',
  ],
  play: ['M5 3l14 9-14 9V3z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  check: ['M20 6L9 17l-5-5'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  more: [
    'M12 13a1 1 0 100-2 1 1 0 000 2z',
    'M19 13a1 1 0 100-2 1 1 0 000 2z',
    'M5 13a1 1 0 100-2 1 1 0 000 2z',
  ],
  refresh: [
    'M23 4v6h-6',
    'M1 20v-6h6',
    'M3.51 9a9 9 0 0114.85-3.36L23 10',
    'M20.49 15A9 9 0 015.64 18.36L1 14',
  ],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  ext: ['M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  filter: ['M22 3H2l8 9.46V19l4 2v-8.54L22 3z'],
  cmd: [
    'M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z',
  ],
  bell: ['M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  logs: [
    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z',
    'M14 2v6h6',
    'M9 13h6',
    'M9 17h6',
    'M9 9h2',
  ],
};

export type IconName = keyof typeof ICONS;

export function Icon({
  d,
  size = 16,
  stroke = 2,
  className,
}: {
  d: string | string[] | IconName;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const paths =
    typeof d === 'string' && d in ICONS
      ? (ICONS[d as IconName] as string | string[])
      : (d as string | string[]);
  const list = Array.isArray(paths) ? paths : [paths];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {list.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
