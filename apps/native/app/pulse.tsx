import { Redirect } from 'expo-router';

// Deep-link alias: stroom-command://pulse → the Pulse tab root.
// `(tabs)/index.tsx` is the Pulse tab but its URL is `/` (Expo Router group
// roots don't appear in paths), so we redirect explicit `/pulse` deep links
// into the tab group here.
export default function PulseRedirect() {
  return <Redirect href="/(tabs)" />;
}
