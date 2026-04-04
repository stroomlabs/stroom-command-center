// Stroom Labs Brand Guide v5.0 — Native implementation

export const colors = {
  // Core palette
  black: '#000000',
  obsidian: '#0A0D0F',
  teal: '#00A19B', // Labs vertical accent
  tealDim: 'rgba(0, 161, 155, 0.15)',
  tealGlow: 'rgba(0, 161, 155, 0.3)',

  // Text
  alabaster: '#F5F5F7',
  silver: '#C8CCCE',
  slate: '#565F64',

  // Surfaces
  surfaceElevated: '#111416',
  surfaceCard: '#0D1012',

  // Glass
  glass: 'rgba(0, 0, 0, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.06)',
  glassBorderHover: 'rgba(255, 255, 255, 0.12)',

  // Status
  statusApprove: '#22C55E',
  statusReject: '#EF4444',
  statusPending: '#F59E0B',
  statusInfo: '#3B82F6',
} as const;

export const fonts = {
  archivo: {
    regular: 'Archivo_400Regular',
    medium: 'Archivo_500Medium',
    semibold: 'Archivo_600SemiBold',
    bold: 'Archivo_700Bold',
    black: 'Archivo_900Black',
  },
  mono: {
    regular: 'IBMPlexMono_400Regular',
    medium: 'IBMPlexMono_500Medium',
    semibold: 'IBMPlexMono_600SemiBold',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const motion = {
  easeOut: [0.4, 0, 0.2, 1] as const,
  spring: [0.16, 1, 0.3, 1] as const,
  maxDuration: 800,
} as const;

export const gradient = {
  background: ['#000000', '#0A0D0F'] as const,
  angle: 145,
} as const;
