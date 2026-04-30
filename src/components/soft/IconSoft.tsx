export type IconName =
  | 'radar'
  | 'vault'
  | 'profiles'
  | 'chev'
  | 'bookmark'
  | 'x'
  | 'ext'
  | 'send'
  | 'plus'
  | 'spark';

export function IconSoft({ name, size = 18 }: { name: IconName; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'radar':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="12" x2="18" y2="6" />
        </svg>
      );
    case 'vault':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="8" y1="13" x2="16" y2="13" />
        </svg>
      );
    case 'profiles':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <rect x="10" y="8" width="4" height="12" rx="1" />
          <rect x="17" y="12" width="4" height="8" rx="1" />
        </svg>
      );
    case 'chev':
      return (
        <svg {...p}>
          <polyline points="6,9 12,15 18,9" />
        </svg>
      );
    case 'bookmark':
      return (
        <svg {...p}>
          <path d="M6 4h12v17l-6-4-6 4z" />
        </svg>
      );
    case 'x':
      return (
        <svg {...p}>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      );
    case 'ext':
      return (
        <svg {...p}>
          <polyline points="9,4 20,4 20,15" />
          <line x1="20" y1="4" x2="10" y2="14" />
          <path d="M14 4h-8a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-8" />
        </svg>
      );
    case 'send':
      return (
        <svg {...p}>
          <polygon points="4,4 20,12 4,20 6,12" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...p}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...p}>
          <polyline points="3,17 8,11 12,14 17,7 21,11" />
        </svg>
      );
  }
}
