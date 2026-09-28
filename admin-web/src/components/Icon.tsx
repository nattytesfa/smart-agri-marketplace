import type { SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'users'
  | 'shield-check'
  | 'wallet'
  | 'trending-up'
  | 'user-group'
  | 'package'
  | 'card'
  | 'settings'
  | 'logout'
  | 'search'
  | 'bell'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'check'
  | 'check-circle'
  | 'x'
  | 'x-circle'
  | 'alert-triangle'
  | 'alert-circle'
  | 'info'
  | 'map-pin'
  | 'map'
  | 'database'
  | 'filter'
  | 'arrow-up-right'
  | 'arrow-down-right'
  | 'arrow-left'
  | 'refresh'
  | 'download'
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'inbox'
  | 'leaf'
  | 'sprout'
  | 'menu'
  | 'more-horizontal'
  | 'clock'
  | 'calendar'
  | 'plus'
  | 'external-link'
  | 'layers'
  | 'sparkles'
  | 'trend-flat'
  | 'hash'
  | 'percent';

const PATHS: Record<IconName, string> = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  users:
    'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 5 18.5V20M14 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm8 12.5v-1.5a3.5 3.5 0 0 0-2.625-3.386M15.5 4.614a3 3 0 0 1 0 5.772',
  'shield-check': 'M12 3l7.5 3v5.25c0 4.5-3 8.4-7.5 9.75-4.5-1.35-7.5-5.25-7.5-9.75V6L12 3Zm-2.5 8.75 2 2 4-4',
  wallet:
    'M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v0M3 8.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5M3 8.5h17M21 11.5h-3.5a1.75 1.75 0 0 0 0 3.5H21v-3.5Z',
  'trending-up': 'M3 17.5 9.5 11l4 4L21 7.5M15 7.5h6v6',
  'user-group':
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  package:
    'M20.5 7.5 12 3 3.5 7.5m17 0v9L12 21m8.5-13.5L12 12m8.5-4.5-9 4.5m-9-4.5L12 12m0 9v-9M3.5 7.5v9L12 21',
  card: 'M3 10h18M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-11Zm3 8.5h4',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.35.95a7.4 7.4 0 0 0-2-1.17L14.6 3h-4l-.35 2.58a7.4 7.4 0 0 0-2 1.17l-2.35-.95-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2.4l-2 1.5 2 3.5 2.35-.95a7.4 7.4 0 0 0 2 1.17L10.6 21h4l.35-2.58a7.4 7.4 0 0 0 2-1.17l2.35.95 2-3.5-2-1.5c.06-.4.1-.8.1-1.2Z',
  logout:
    'M9 21H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3H9m10 12-4-3.5m4 3.5L15 18m4-3.5H9',
  search: 'M20 20l-4-4m2-5.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9ZM13.75 19a2 2 0 0 1-3.5 0',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevron-up': 'm6 15 6-6 6 6',
  check: 'm5 13 4.5 4.5L19 7',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-9.2 2.5 2.5 4.5-5',
  x: 'M6 6l12 12M18 6 6 18',
  'x-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5l5 5m0-5-5 5',
  'alert-triangle':
    'M10.3 4.3 2.6 17.4A1.9 1.9 0 0 0 4.3 20.3h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 4.3a1.9 1.9 0 0 0-3.4 0ZM12 9.5v4M12 17h.01',
  'alert-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5M12 16.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v4.5h1',
  'map-pin': 'M20 10.5c0 5.5-8 11.5-8 11.5s-8-6-8-11.5a8 8 0 0 1 16 0ZM14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  map: 'M9 4 3 6.5v13L9 17m0-13 6 2.5m-6-2.5V17m6-8.5L21 4.5v13L15 19m0-10.5V19M3 19.5l6-2.5m6 2.5 6-2.5',
  database:
    'M20 6c0 1.66-3.58 3-8 3S4 7.66 4 6s3.58-3 8-3 8 1.34 8 3Zm0 0v12c0 1.66-3.58 3-8 3s-8-1.34-8-3V6m16 6c0 1.66-3.58 3-8 3s-8-1.34-8-3',
  filter: 'M4 5h16l-6.5 7.5V20l-3-1.5v-6L4 5Z',
  'arrow-up-right': 'M7 17 17 7m-8 0h8v8',
  'arrow-down-right': 'M7 7l10 10m0-8v8h-8',
  'arrow-left': 'M20 12H4m0 0 6-6m-6 6 6 6',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 4v7h-7',
  download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17',
  mail: 'M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5Zm-.5 2 8.5 6 8.5-6',
  lock: 'M7 10V7.5a5 5 0 0 1 10 0V10m-11 0h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm12 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  'eye-off':
    'M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.4M6.2 7.8A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.25 3.3-.65M3 3l18 18M10.2 10.3a2.5 2.5 0 0 0 3.4 3.5',
  inbox:
    'M20 12h-4l-1.5 3h-5L8 12H4m16 0v6.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5V12m16 0-2.7-6.1A1.5 1.5 0 0 0 15.9 5H8.1a1.5 1.5 0 0 0-1.4.9L4 12',
  leaf: 'M4 20c0-8 5-14 16-15 0 10-5 15-12 15H4Zm0 0c1-3 3-5 6-6.5',
  sprout: 'M12 21v-8m0 0c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6Zm0-2c0-3 2-5.5 5.5-5.5 0 3-2 5.5-5.5 5.5Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  'more-horizontal': 'M6 12h.01M12 12h.01M18 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
  calendar:
    'M7 3v3m10-3v3M4.5 9.5h15M6 5.5h12A1.5 1.5 0 0 1 19.5 7v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V7A1.5 1.5 0 0 1 6 5.5Z',
  plus: 'M12 5v14M5 12h14',
  'external-link': 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  layers: 'M12 3 3 7.5l9 4.5 9-4.5L12 3Zm9 9-9 4.5L3 12m18 4.5L12 21l-9-4.5',
  sparkles: 'M12 3.5 13.6 8 18 9.5 13.6 11 12 15.5 10.4 11 6 9.5 10.4 8 12 3.5ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  'trend-flat': 'M3 17.5 9.5 11l4 4L21 7.5M15 7.5h6v6',
  hash: 'M5 9h14M5 15h14M10 4l-1.5 16M15.5 4 14 20',
  percent: 'M18 6 6 18M8 9.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm11.5 5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Z',
};

/**
 * Only icons whose paths describe genuinely closed, solid shapes are safe to
 * render with fill. Everything else is an open polyline or arc and would
 * collapse into an unreadable sliver when filled, so it stays stroked.
 */
const SAFE_FILLED = new Set<IconName>(['dashboard']);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  filled?: boolean;
  strokeWidth?: number;
  title?: string;
}

export default function Icon({
  name,
  size = 18,
  filled,
  strokeWidth = 1.7,
  title,
  ...rest
}: IconProps) {
  const useFill = filled ?? SAFE_FILLED.has(name);
  const d = PATHS[name];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={useFill ? 'currentColor' : 'none'}
      stroke={useFill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
