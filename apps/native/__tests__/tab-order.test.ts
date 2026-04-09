import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Tab order invariant', () => {
  const layoutPath = path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx');
  const layoutSource = fs.readFileSync(layoutPath, 'utf-8');
  const expectedOrder = ['index', 'queue', 'explore', 'command', 'projects', 'ops'];

  // Match only Tabs.Screen declarations, not TabIcon name props or other usages.
  // Captures: <Tabs.Screen ... name="<value>"
  const tabsScreenRegex = /<Tabs\.Screen[^>]*?\sname=["']([^"']+)["']/g;
  const declaredTabs: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tabsScreenRegex.exec(layoutSource)) !== null) {
    declaredTabs.push({ name: match[1], index: match.index });
  }

  it('declares exactly six Tabs.Screen entries', () => {
    expect(declaredTabs.length).toBe(6);
  });

  it('declares Tabs.Screen entries in the expected order', () => {
    const declaredNames = declaredTabs.map((t) => t.name);
    expect(declaredNames).toEqual(expectedOrder);
  });

  it('ops is declared exactly once as a Tabs.Screen', () => {
    const opsScreens = declaredTabs.filter((t) => t.name === 'ops');
    expect(opsScreens.length).toBe(1);
  });
});
