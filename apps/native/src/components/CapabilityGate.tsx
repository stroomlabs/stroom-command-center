import React from 'react';
import { useCapabilities } from '../hooks/useCapabilities';

// Wraps any subtree in a capability check. Renders children only when the
// current operator's role grants `capability`. While the snapshot is still
// loading on the very first sign-in, we render the fallback (default null)
// rather than briefly flashing privileged UI — once a fresh snapshot lands
// the component re-renders against the real value.
//
// For the common owner / Kevin case, the snapshot hydrates from
// AsyncStorage in the same frame as the first render, so the gate
// resolves to "granted" instantly and there is no visible flicker.

export interface CapabilityGateProps {
  capability: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function CapabilityGate({
  capability,
  children,
  fallback = null,
}: CapabilityGateProps) {
  const granted = useCapability(capability);
  return <>{granted ? children : fallback}</>;
}

// Inline shortcut — preferred for `if (granted) { … }` branches inside
// hooks or callbacks where wrapping JSX would be awkward.
export function useCapability(key: string): boolean {
  const { hasCapability, isLoading, capabilities } = useCapabilities();
  // While we have *no* snapshot at all (cold first launch), deny by default.
  // Once we have any snapshot — even a stale one from AsyncStorage — trust
  // its answer. This guarantees the privileged UI never flashes for an
  // operator who shouldn't see it.
  if (isLoading && Object.keys(capabilities).length === 0) return false;
  return hasCapability(key);
}
