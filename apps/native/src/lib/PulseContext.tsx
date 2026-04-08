import React, { createContext, useContext, useMemo } from 'react';
import { usePulseData } from '../hooks/usePulseData';
import { useVerticalSelection, VERTICAL_BUCKETS } from './verticals';

type PulseContextValue = ReturnType<typeof usePulseData> & {
  // Expose the currently active vertical key and domains filter so any
  // consumer (sparklines, recent activity, delta panels) can filter the
  // same way Pulse does.
  verticalKey: ReturnType<typeof useVerticalSelection>[0];
  verticalDomains: string[] | null;
  setVertical: ReturnType<typeof useVerticalSelection>[1];
};

const PulseContext = createContext<PulseContextValue | null>(null);

// Single source of truth for get_command_pulse. The provider reads the
// active vertical selection from AsyncStorage via useVerticalSelection,
// resolves it to a domains[] filter via VERTICAL_BUCKETS, and passes it
// down to usePulseData. When the operator flips the toggle, the hook
// refetches and every consumer (Pulse screen, Queue tab badge, Ops summary)
// updates automatically.
export function PulseProvider({ children }: { children: React.ReactNode }) {
  const [verticalKey, setVertical] = useVerticalSelection();
  const verticalDomains = useMemo(
    () => VERTICAL_BUCKETS[verticalKey]?.domains ?? null,
    [verticalKey]
  );
  const pulse = usePulseData(verticalDomains);
  const value: PulseContextValue = {
    ...pulse,
    verticalKey,
    verticalDomains,
    setVertical,
  };
  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

export function usePulseContext(): PulseContextValue {
  const ctx = useContext(PulseContext);
  if (!ctx) {
    throw new Error('usePulseContext must be used inside <PulseProvider>');
  }
  return ctx;
}
