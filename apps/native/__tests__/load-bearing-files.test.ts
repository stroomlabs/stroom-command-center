import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Load-bearing files exist at declared paths', () => {
  const root = path.join(__dirname, '..');
  const files = [
    'app/(tabs)/_layout.tsx',
    'app/_layout.tsx',
    'src/components/ScreenTransition.tsx',
    'src/components/ScreenHeader.tsx',
    'src/components/ScreenWatermark.tsx',
    'src/components/CapabilityGate.tsx',
    'src/hooks/useCapabilities.ts',
    'src/lib/supabase.ts',
  ];

  for (const f of files) {
    it(`${f} exists`, () => {
      expect(fs.existsSync(path.join(root, f))).toBe(true);
    });
  }
});
