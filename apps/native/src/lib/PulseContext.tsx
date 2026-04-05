import React, { createContext, useContext } from 'react';
import { usePulseData } from '../hooks/usePulseData';

type PulseContextValue = ReturnType<typeof usePulseData>;

const PulseContext = createContext<PulseContextValue | null>(null);

// Single source of truth for get_command_pulse. The provider calls
// usePulseData once and fans the result out to every consumer (Pulse
// screen, Queue tab badge, Ops summary cells), so we don't duplicate the
// RPC, the realtime subscription, or the AppState listener across the tree.
export function PulseProvider({ children }: { children: React.ReactNode }) {
  const value = usePulseData();
  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

export function usePulseContext(): PulseContextValue {
  const ctx = useContext(PulseContext);
  if (!ctx) {
    throw new Error('usePulseContext must be used inside <PulseProvider>');
  }
  return ctx;
}
