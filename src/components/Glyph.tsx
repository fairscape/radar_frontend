export type GlyphName =
  | 'radar'
  | 'vault'
  | 'profiles'
  | 'search'
  | 'chev'
  | 'chev-d'
  | 'x'
  | 'plus'
  | 'ext';

export function Glyph({ name, size = 14 }: { name: GlyphName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
  };
  switch (name) {
    case 'radar':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" />
          <circle cx="8" cy="8" r="3.5" />
          <line x1="8" y1="2" x2="8" y2="14" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="8" y1="8" x2="12.5" y2="3.5" />
        </svg>
      );
    case 'vault':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="12" height="10" />
          <line x1="2" y1="6" x2="14" y2="6" />
          <line x1="5" y1="9" x2="11" y2="9" />
          <line x1="5" y1="11" x2="9" y2="11" />
        </svg>
      );
    case 'profiles':
      return (
        <svg {...props}>
          <rect x="2" y="2.5" width="3" height="11" />
          <rect x="6.5" y="5.5" width="3" height="8" />
          <rect x="11" y="8" width="3" height="5.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="7" cy="7" r="4" />
          <line x1="10" y1="10" x2="13.5" y2="13.5" />
        </svg>
      );
    case 'chev':
      return (
        <svg {...props}>
          <polyline points="6,4 10,8 6,12" />
        </svg>
      );
    case 'chev-d':
      return (
        <svg {...props}>
          <polyline points="4,6 8,10 12,6" />
        </svg>
      );
    case 'x':
      return (
        <svg {...props}>
          <line x1="3" y1="3" x2="13" y2="13" />
          <line x1="13" y1="3" x2="3" y2="13" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      );
    case 'ext':
      return (
        <svg {...props}>
          <polyline points="6,3 13,3 13,10" />
          <line x1="13" y1="3" x2="7" y2="9" />
          <polyline points="3,6 3,13 10,13" />
        </svg>
      );
  }
}
