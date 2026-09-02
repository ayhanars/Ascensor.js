type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const EyeIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

export const EyeOffIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2 2l12 12" />
    <path d="M4.2 4.6C2.4 5.7 1 8 1 8s2.5 4.5 7 4.5c1.3 0 2.4-.4 3.4-.9M7 3.6c.3 0 .6-.1 1-.1 4.5 0 7 4.5 7 4.5s-.6 1.1-1.7 2.2" />
    <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" />
  </svg>
);

export const LockIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
    <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
  </svg>
);

export const UnlockIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
    <path d="M5.2 7V5a2.8 2.8 0 0 1 5.5-.9" />
  </svg>
);

export const GroupIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2" y="2" width="7" height="7" rx="1" />
    <rect x="7" y="7" width="7" height="7" rx="1" />
  </svg>
);

export const ShapeIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 1.5l6 3.5v6L8 14.5 2 11V5l6-3.5Z" />
  </svg>
);

export const TrashIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.6 8.4a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-8.4" />
  </svg>
);

export const DuplicateIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
    <path d="M2.5 10.5V3.5a1 1 0 0 1 1-1h7" />
  </svg>
);

export const ChevronRightIcon = ({ size = 12 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5.5 3.5 10 8l-4.5 4.5" />
  </svg>
);
