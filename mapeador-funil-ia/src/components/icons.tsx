// Ícones inline (mesma convenção já usada em ThemeToggle/NotificationBell:
// SVG 24x24, stroke=currentColor, sem lib externa nova) — um por módulo da
// sidebar, pra manter um único estilo visual em todo o menu.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(children: ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return base(
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9.5 20v-6h5v6" />
    </>,
    props,
  );
}

export function IconBuilding(props: IconProps) {
  return base(
    <>
      <rect x="4" y="3" width="11" height="18" rx="1" />
      <rect x="15" y="9" width="5" height="12" rx="1" />
      <path d="M7.5 7h4M7.5 11h4M7.5 15h4" />
    </>,
    props,
  );
}

export function IconCalendar(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>,
    props,
  );
}

export function IconWorkflow(props: IconProps) {
  return base(
    <>
      <circle cx="5.5" cy="6" r="2.2" />
      <circle cx="18.5" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.3 7.3 10 16M16.7 7.3 14 16" />
    </>,
    props,
  );
}

export function IconTimeline(props: IconProps) {
  return base(
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </>,
    props,
  );
}

export function IconFileText(props: IconProps) {
  return base(
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12.5h7M8.5 16h7" />
    </>,
    props,
  );
}

export function IconBarChart(props: IconProps) {
  return base(
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>,
    props,
  );
}

export function IconDatabase(props: IconProps) {
  return base(
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
      <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
    </>,
    props,
  );
}

export function IconLayers(props: IconProps) {
  return base(
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
      <path d="m3.5 12 8.5 4.5L20.5 12" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </>,
    props,
  );
}

export function IconUsers(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20v-1.5A5 5 0 0 1 9 14a5 5 0 0 1 5.5 4.5V20" />
      <path d="M16 4.5a3 3 0 0 1 0 6" />
      <path d="M15.5 14a5 5 0 0 1 4.5 4.5V20" />
    </>,
    props,
  );
}

export function IconBell(props: IconProps) {
  return base(
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>,
    props,
  );
}

export function IconSettings(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H2a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0A1.7 1.7 0 0 0 9 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.56 1.04H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" />
    </>,
    props,
  );
}

export function IconActivity(props: IconProps) {
  return base(<path d="M3 12h4l2.5 7L14 5l2.5 7H21" />, props);
}

export function IconChevronLeft(props: IconProps) {
  return base(<path d="M14.5 5 7 12l7.5 7" />, props);
}

export function IconChevronRight(props: IconProps) {
  return base(<path d="m9.5 5 7.5 7-7.5 7" />, props);
}

export function IconChevronDown(props: IconProps) {
  return base(<path d="m5 8.5 7 7 7-7" />, props);
}

export function IconMenu(props: IconProps) {
  return base(<path d="M4 6.5h16M4 12h16M4 17.5h16" />, props);
}

export function IconX(props: IconProps) {
  return base(<path d="M5 5 19 19M19 5 5 19" />, props);
}
