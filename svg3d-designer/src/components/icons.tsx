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

export const ImageLayerIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.2" />
    <circle cx="5.6" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <path d="M2 11.5l3.6-3.6a1 1 0 0 1 1.4 0L9.8 10.7 11.4 9.1a1 1 0 0 1 1.4 0L14 10.3" />
  </svg>
);

export const TrashIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.6 8.4a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.6-8.4" />
  </svg>
);

export const PlusIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 2.5v11M2.5 8h11" />
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

export const SunIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6 3.5 3.5" />
  </svg>
);

export const CursorToolIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M3 2.2 12.5 8l-4 1-1.5 4.2-4-11Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinejoin="round"
    />
  </svg>
);

export const RectangleToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="2.5" y="4" width="11" height="8" rx="1" />
  </svg>
);

export const CircleToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="5.5" />
  </svg>
);

export const PolygonToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 2 14 6.5 11.7 13.5H4.3L2 6.5Z" />
  </svg>
);

export const PenToolIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.23527 1.51096C3.74439 1.39247 3.40733 1.99348 3.7644 2.35056L10.4816 9.06778C10.6469 9.02358 10.8206 9.00001 10.9998 9.00001C12.1043 9.00001 12.9998 9.89544 12.9998 11C12.9998 12.1046 12.1043 13 10.9998 13C9.8952 13 8.99976 12.1046 8.99976 11C8.99976 10.8209 9.02331 10.6473 9.06748 10.4821L2.35031 3.7649C1.99324 3.40782 1.39223 3.74489 1.51072 4.23577L4.52771 16.7347C4.61907 17.1132 4.92185 17.4043 5.30367 17.4807L11.069 18.6337C10.9279 18.9928 11.0025 19.417 11.2927 19.7072L14.2927 22.7072C14.6832 23.0977 15.3163 23.0977 15.7069 22.7072L22.7069 15.7072C23.0974 15.3166 23.0974 14.6835 22.7069 14.293L19.7069 11.293C19.4167 11.0028 18.9925 10.9282 18.6334 11.0693L17.4804 5.30397C17.404 4.92214 17.1129 4.61936 16.7344 4.528L4.23527 1.51096Z" />
  </svg>
);

export const CutToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="4.2" cy="4.2" r="1.9" />
    <circle cx="4.2" cy="11.8" r="1.9" />
    <path d="M5.6 5.6 13.5 12M5.6 10.4 13.5 4" />
  </svg>
);

export const StarToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 1.8 9.7 6h4.5l-3.6 2.7 1.4 4.4L8 10.4l-3.9 2.7 1.4-4.4L1.8 6h4.5Z" strokeLinejoin="round" />
  </svg>
);

export const MoonIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3Z" />
  </svg>
);

export const UndoIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 6.5h6.5a4 4 0 0 1 0 8H6" />
    <path d="M5.8 3.8 3 6.5l2.8 2.7" />
  </svg>
);

export const RedoIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M13 6.5H6.5a4 4 0 0 0 0 8H10" />
    <path d="M10.2 3.8 13 6.5l-2.8 2.7" />
  </svg>
);

export const AlignLeftIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2.5 1.5v13" />
    <rect x="2.5" y="3" width="9" height="3.5" rx="0.6" />
    <rect x="2.5" y="9.5" width="5.5" height="3.5" rx="0.6" />
  </svg>
);

export const AlignCenterHIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 1.5v13" />
    <rect x="3.5" y="3" width="9" height="3.5" rx="0.6" />
    <rect x="5.25" y="9.5" width="5.5" height="3.5" rx="0.6" />
  </svg>
);

export const AlignRightIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M13.5 1.5v13" />
    <rect x="4.5" y="3" width="9" height="3.5" rx="0.6" />
    <rect x="8" y="9.5" width="5.5" height="3.5" rx="0.6" />
  </svg>
);

export const AlignTopIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M1.5 2.5h13" />
    <rect x="3" y="2.5" width="3.5" height="9" rx="0.6" />
    <rect x="9.5" y="2.5" width="3.5" height="5.5" rx="0.6" />
  </svg>
);

export const AlignMiddleVIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M1.5 8h13" />
    <rect x="3" y="3.5" width="3.5" height="9" rx="0.6" />
    <rect x="9.5" y="5.25" width="3.5" height="5.5" rx="0.6" />
  </svg>
);

export const AlignBottomIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M1.5 13.5h13" />
    <rect x="3" y="4.5" width="3.5" height="9" rx="0.6" />
    <rect x="9.5" y="8" width="3.5" height="5.5" rx="0.6" />
  </svg>
);

export const InfoIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2v4" />
    <circle cx="8" cy="4.9" r="0.7" fill="currentColor" stroke="none" />
  </svg>
);

export const HoleToolIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
  </svg>
);

export const BookmarkIcon = ({ size = 14, filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? "currentColor" : "none"}>
    <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1Z" />
  </svg>
);

export const BoolUnionIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path
      d="M2 2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v5H9a2 2 0 0 1-2-2V9H2V2Z"
      fill="currentColor"
      fillOpacity={0.3}
    />
    <rect x="2" y="2" width="9" height="9" rx="1" />
    <rect x="5" y="5" width="9" height="9" rx="1" />
  </svg>
);

export const BoolSubtractIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2 2h9v3H9a2 2 0 0 0-2 2v2H2V2Z" fill="currentColor" fillOpacity={0.3} />
    <rect x="2" y="2" width="9" height="9" rx="1" />
    <rect x="5" y="5" width="9" height="9" rx="1" strokeDasharray="2 1.5" />
  </svg>
);

export const BoolIntersectIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 5h6v6H5V5Z" fill="currentColor" fillOpacity={0.35} />
    <rect x="2" y="2" width="9" height="9" rx="1" strokeDasharray="2 1.5" />
    <rect x="5" y="5" width="9" height="9" rx="1" strokeDasharray="2 1.5" />
  </svg>
);

export const BoolExcludeIcon = ({ size = 14 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M2 2h9v3H9a2 2 0 0 0-2 2v2H2V2Z" fill="currentColor" fillOpacity={0.3} />
    <path d="M14 14H5v-3h2a2 2 0 0 0 2-2V7h5v7Z" fill="currentColor" fillOpacity={0.3} />
    <rect x="2" y="2" width="9" height="9" rx="1" />
    <rect x="5" y="5" width="9" height="9" rx="1" />
  </svg>
);
