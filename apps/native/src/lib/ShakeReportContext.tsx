import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Accelerometer } from 'expo-sensors';
import { haptics } from './haptics';
import { useSegments } from 'expo-router';
import { ShakeReportModal } from '../components/ShakeReportModal';

// Shake detection tuning:
//   - Accelerometer samples at 100ms.
//   - A "shake event" is any sample whose total-g exceeds THRESHOLD.
//   - If 3+ shake events fire inside a 1000ms rolling window, the modal
//     opens. Requires three peaks so a single jolt (tap on table, bumped
//     device) doesn't trigger it.
//   - COOLDOWN_MS prevents the modal from re-firing immediately after
//     dismiss.
const THRESHOLD = 1.8; // g — roughly "intentional shake"
const WINDOW_MS = 1000;
const REQUIRED_EVENTS = 3;
const COOLDOWN_MS = 2000;

interface ShakeReportContextValue {
  open: () => void;
}

const ShakeReportContext = createContext<ShakeReportContextValue | null>(null);

// Resolves the current route into a human-readable screen name for the
// debug report ("Pulse", "Queue", "Claim detail", …). Falls back to the
// raw segment list if an unknown route is hit.
function resolveScreenName(segments: string[]): string {
  if (segments.length === 0) return 'Home';
  // Tab routes surface as ['(tabs)', 'index'|'queue'|'explore'|...]
  if (segments[0] === '(tabs)') {
    const tab = segments[1] ?? 'index';
    switch (tab) {
      case 'index':
        return 'Pulse';
      case 'queue':
        return 'Queue';
      case 'explore':
        return 'Explore';
      case 'command':
        return 'Command';
      case 'ops':
        return 'Ops';
      default:
        return `Tab: ${tab}`;
    }
  }
  // Dynamic detail routes: ['claim', '[id]'], ['entity', '[id]'], …
  const top = segments[0];
  const map: Record<string, string> = {
    claim: 'Claim detail',
    entity: 'Entity detail',
    source: 'Source detail',
    predicate: 'Predicate detail',
    audit: 'Audit Trail',
    research: 'Research Queue',
    sources: 'Sources',
    coverage: 'Coverage Gaps',
    digest: 'Daily Digest',
    more: 'Settings',
    policies: 'Policies',
    analytics: 'Analytics',
    notifications: 'Notifications',
    'notification-prefs': 'Notification Prefs',
    login: 'Login',
  };
  return map[top] ?? segments.join('/');
}

export function ShakeReportProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const segments = useSegments();
  const screenName = resolveScreenName(segments as string[]);

  // Ring buffer of recent shake-event timestamps. We drop anything older
  // than WINDOW_MS on every sample; the length check tells us if a shake
  // pattern just completed.
  const peaksRef = useRef<number[]>([]);
  const lastOpenAtRef = useRef(0);
  // The modal visibility is also captured in a ref so the accelerometer
  // callback can early-return without needing to re-subscribe when
  // `visible` changes.
  const visibleRef = useRef(false);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    let sub: ReturnType<typeof Accelerometer.addListener> | null = null;
    let cancelled = false;
    (async () => {
      try {
        const available = await Accelerometer.isAvailableAsync();
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(100);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          // Total-g including gravity. Subtracting 1 approximates net
          // acceleration; we just care about the magnitude of deviation.
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          if (magnitude < THRESHOLD) return;

          const now = Date.now();
          // Cooldown: ignore shakes that arrive right after a prior open.
          if (now - lastOpenAtRef.current < COOLDOWN_MS) return;
          // Don't open on top of the modal — if it's already up, just
          // let the buffer drain.
          if (visibleRef.current) return;

          const buf = peaksRef.current;
          buf.push(now);
          // Drop anything outside the rolling window.
          while (buf.length > 0 && now - buf[0] > WINDOW_MS) {
            buf.shift();
          }
          if (buf.length >= REQUIRED_EVENTS) {
            peaksRef.current = [];
            lastOpenAtRef.current = now;
            haptics.warning();
            setVisible(true);
          }
        });
      } catch {
        // expo-sensors not available (web, simulator without motion) —
        // shake gesture simply won't fire. Not fatal.
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const value: ShakeReportContextValue = {
    open: () => setVisible(true),
  };

  return (
    <ShakeReportContext.Provider value={value}>
      {children}
      <ShakeReportModal
        visible={visible}
        onDismiss={() => setVisible(false)}
        screenName={screenName}
      />
    </ShakeReportContext.Provider>
  );
}

// Exposes a manual-open trigger for devs who want to wire it to a hidden
// button during development. Safe to call without the provider — returns
// a no-op open().
export function useShakeReport(): ShakeReportContextValue {
  const ctx = useContext(ShakeReportContext);
  return ctx ?? { open: () => {} };
}
