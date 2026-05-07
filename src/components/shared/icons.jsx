// Central icon registry. To add an icon: add a key to iconPaths and render <Icon name="key" />.
// No external library — all paths are hand-authored SVG on a 20x20 viewBox.

const iconPaths = {
  dashboard: (
    <>
      <rect x="2"  y="2"  width="7" height="7" rx="1.5" />
      <rect x="11" y="2"  width="7" height="7" rx="1.5" />
      <rect x="2"  y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </>
  ),

  crew: (
    <>
      <circle cx="10" cy="6" r="4" />
      <path d="M2 19a8 8 0 0116 0H2z" />
    </>
  ),

  chemical: (
    <>
      <rect x="6.5" y="1" width="7" height="2" rx="1" />
      <path d="M8 3v6.5L3.5 17a1 1 0 00.9 1.5h11.2a1 1 0 00.9-1.5L12 9.5V3H8z" />
    </>
  ),

  budget: (
    <>
      <rect x="2"  y="12" width="4" height="6" rx="1" />
      <rect x="8"  y="7"  width="4" height="11" rx="1" />
      <rect x="14" y="3"  width="4" height="15" rx="1" />
    </>
  ),

  inventory: (
    <>
      <path d="M10 2L2 7h16L10 2z" />
      <rect x="2" y="7" width="16" height="11" rx="1" />
      <rect x="7" y="11" width="6" height="1.5" rx=".75" opacity=".4" />
    </>
  ),

  equipment: (
    // Wrench: open-ring head (evenodd hole) + diagonal handle
    <>
      <path
        fillRule="evenodd"
        d="M14.5 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 2a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
      />
      <rect
        x="2" y="14" width="10" height="3" rx="1.5"
        transform="rotate(-45 7 15.5)"
      />
    </>
  ),

  spray: (
    // Nozzle body pointing right + three droplets
    <>
      <path d="M2 13h8V9.5H6.5L2 13z" />
      <circle cx="13.5" cy="8.5"  r="1.5" />
      <circle cx="16.5" cy="12"   r="1.5" />
      <circle cx="13"   cy="15.5" r="1.5" />
    </>
  ),

  disease: (
    // Shield with concentric ring cut-out (disease target)
    <path
      fillRule="evenodd"
      d="M10 2L3 5.5v5C3 14.5 6.5 18 10 19c3.5-1 7-4.5 7-8.5v-5L10 2zm0 4.5a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4z"
    />
  ),

  plantNutrition: (
    // Leaf + stem
    <>
      <path
        d="M10 18v-7"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"
      />
      <path d="M10 11C6 11 3 7 4 3c3 0 7 2 7 7 0-5 4-7 7-7-1 4-4 8-8 8z" />
    </>
  ),

  culturalPractices: (
    // Core aerator: horizontal bar + tines above + plugs below
    <>
      <rect x="1" y="9" width="18" height="2.5" rx="1.25" />
      <path
        d="M4.5 9V5M9 9V4M13 9V5M17.5 9V4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"
      />
      <rect x="3"  y="13" width="2" height="4" rx="1" />
      <rect x="9"  y="13" width="2" height="4" rx="1" />
      <rect x="15" y="13" width="2" height="4" rx="1" />
    </>
  ),

  settings: (
    // Gear: outer shape with evenodd inner circle cut-out
    <path
      fillRule="evenodd"
      d="M8.5 2l-.3 1.8a6 6 0 00-1.9 1.1L4.6 4.2 3 6.1l1.1 1.3a6 6 0 000 2.4L3 11.2l1.6 1.9 1.7-.7a6 6 0 001.9 1.1l.3 1.8h3l.3-1.8a6 6 0 001.9-1.1l1.7.7 1.6-1.9-1.1-1.4a6 6 0 000-2.4L17 6.1 15.4 4.2l-1.7.7a6 6 0 00-1.9-1.1L11.5 2h-3zM10 13a3 3 0 110-6 3 3 0 010 6z"
    />
  ),

  chevronLeft: (
    <path
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      fill="none"
      d="M13 5l-6 5 6 5"
    />
  ),

  chevronRight: (
    <path
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      fill="none"
      d="M7 5l6 5-6 5"
    />
  ),

  menu: (
    <path
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      fill="none"
      d="M3 5h14M3 10h14M3 15h14"
    />
  ),

  close: (
    <path
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      fill="none"
      d="M4 4l12 12M16 4L4 16"
    />
  ),
}

export function Icon({ name, size = 18, className }) {
  const content = iconPaths[name]
  if (!content) return null
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  )
}
