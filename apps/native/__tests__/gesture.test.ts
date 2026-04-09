import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Gesture invariant', () => {
  const layoutPath = path.join(__dirname, '..', 'app', '_layout.tsx');
  const layoutSource = fs.readFileSync(layoutPath, 'utf-8');

  it('Stack root enables full-screen native iOS swipe-back', () => {
    expect(layoutSource).toMatch(/fullScreenGestureEnabled\s*:\s*true/);
  });
});
