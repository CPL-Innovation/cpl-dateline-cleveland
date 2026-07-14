// Font-family shorthands (match the design tokens in theme.css). Kept as plain
// strings so they compose cleanly inside inline style objects.
export const SERIF = "'Spectral', Georgia, serif";
export const SANS = "'Work Sans', sans-serif";
export const MONO = "'JetBrains Mono', monospace";

// Palette (mirrors theme.css :root, for use in dynamic inline styles).
export const C = {
  navy: '#0057B7',
  navyDeep: '#004591',
  marigold: '#F1C400',
  ink: '#0F1215',
  body: '#2B3340',
  secondary: '#505A69',
  tertiary: '#8A94A3',
  canvas: '#FFFFFF',
  sunken: '#F2F4F7',
  hairLight: '#E6E9EE',
  hairMed: '#C9CFD8',
} as const;
