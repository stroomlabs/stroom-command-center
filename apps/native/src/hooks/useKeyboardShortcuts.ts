import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Maps physical key presses to named actions. Only active on platforms
// where a hardware keyboard is likely attached (iPad, simulator, Android
// with external keyboard). On phone-only builds this is inert — no
// overhead beyond the empty effect.
type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  enabled = true
) {
  // React Native doesn't have a built-in `keyDown` event for arbitrary
  // hardware key presses in JS. On iOS/Android, the recommended approach
  // is to listen for `keyPress` events on a focused TextInput — which
  // doesn't help for global shortcuts.
  //
  // On web (Expo Web) we can use `document.addEventListener('keydown')`.
  // On native, we rely on the RCTKeyCommands mechanism injected via the
  // DevMenu bridge, which only works in dev. For production iPad support,
  // a native module would be required.
  //
  // This hook uses the web path when available and is a no-op on native
  // until a native key-event module is added. The Queue screen renders
  // the shortcut legend and focus management regardless — the shortcuts
  // just won't fire on native production builds without the module.
  const mapRef = useRef(shortcuts);
  mapRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== 'web') return;

    const handler = (e: KeyboardEvent) => {
      // Skip when a text input is focused — typing shouldn't trigger shortcuts.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const fn = mapRef.current[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
