// Hardcoded Stroom Labs client registry. Backing store for the Projects
// tab skeleton shipped in batch 30a. Real integration (Supabase-backed
// projects table, live activity, linked claims/entities) ships in the
// Day 2 OTA — until then this constant is the single source of truth the
// Projects list + detail screens read from.

export type Project = {
  slug: string;
  displayName: string;
  clientType: 'internal' | 'external_retainer' | 'external_project';
  primaryDomain: string | null;
  stackSummary: string;
  status: 'active' | 'paused' | 'archived';
};

export const PROJECTS: Project[] = [
  {
    slug: 'stroom-racing',
    displayName: 'Stroom Racing',
    clientType: 'internal',
    primaryDomain: 'stroomracing.com',
    stackSummary: 'Next.js + Supabase + Vercel',
    status: 'active',
  },
  {
    slug: 'brushed-on-main',
    displayName: 'Brushed on Main',
    clientType: 'external_retainer',
    primaryDomain: null,
    stackSummary: 'Next.js + Supabase RPC',
    status: 'active',
  },
  {
    slug: 'huizenga',
    displayName: 'Huizenga Heating & Cooling',
    clientType: 'external_project',
    primaryDomain: null,
    stackSummary: 'TBD',
    status: 'active',
  },
  {
    slug: 'daniel-dye-racing',
    displayName: 'Daniel Dye Racing',
    clientType: 'external_project',
    primaryDomain: null,
    stackSummary: 'TBD',
    status: 'active',
  },
];

export const getProjectBySlug = (slug: string): Project | undefined =>
  PROJECTS.find((p) => p.slug === slug);

// Human-readable label for the client type pill on both the list + detail
// screens. Kept here so the two screens never drift.
export const CLIENT_TYPE_LABEL: Record<Project['clientType'], string> = {
  internal: 'Internal',
  external_retainer: 'Retainer',
  external_project: 'Project',
};
