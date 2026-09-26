import type { CSSProperties } from "react";

// Shared sizing; Boxicons uses its original filled outline geometry.
const paths = {
  // Boxicons bx-blanket (MIT). License: /licenses/boxicons.txt
  blanket: (
    <path
      fill="currentColor"
      stroke="none"
      d="M20 2H7C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h12c1.654 0 3-1.346 3-3s-1.346-3-3-3H6v2h13a1 1 0 0 1 0 2H7c-1.654 0-3-1.346-3-3s1.346-3 3-3h13c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2zm0 10H7a4.973 4.973 0 0 0-3 1.002V7c0-1.654 1.346-3 3-3h13v8z"
    />
  ),
  images: (
    <>
      <rect x="5" y="3" width="16" height="16" rx="3" />
      <path d="M17 21H6a3 3 0 0 1-3-3V7M5 15l5-5 4 4 3-3 4 4" />
      <circle cx="16" cy="7" r="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m3 16 5-5 4 4 4-5 5 6" />
      <circle cx="8" cy="7" r="1" />
    </>
  ),
  rates: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  settings: (
    <>
      <path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="18" r="2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  back: <path d="m14 5-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14" />
      <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </>
  ),
  inbox: (
    <>
      <path d="m4 4-2 10v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5L20 4Z" />
      <path d="M2 14h6l2 3h4l2-3h6" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="3" />
      <path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  spinner: <path d="M21 12a9 9 0 1 1-9-9" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      style={{ "--icon-size": `${size}px` } as CSSProperties}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
