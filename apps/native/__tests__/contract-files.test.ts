import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Foundation contract files', () => {
  it('INVARIANTS.md exists and has required sections', () => {
    const p = path.join(__dirname, '..', 'INVARIANTS.md');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf-8');
    expect(src).toMatch(/## Navigation/);
    expect(src).toMatch(/## Gestures/);
    expect(src).toMatch(/## Load-Bearing Files/);
    expect(src).toMatch(/## Recently Fixed/);
  });

  it('STATE.md exists and has Current Build section', () => {
    const p = path.join(__dirname, '..', 'STATE.md');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf-8');
    expect(src).toMatch(/## Current Build/);
  });

  it('CLAUDE.md at repo root has Pre-Flight section', () => {
    const p = path.join(__dirname, '..', '..', '..', 'CLAUDE.md');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf-8');
    expect(src).toMatch(/Pre-Flight/);
  });
});
