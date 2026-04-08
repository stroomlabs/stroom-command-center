import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import supabase from '../lib/supabase';

// Route a notification response to the right screen. If the payload includes
// a claim_id we deep-link straight to the claim detail; otherwise we land on
// the governance Queue tab, which is where every push-notify notification
// originates for now.
function routeFromNotification(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>
) {
  const data = response.notification?.request?.content?.data as
    | Record<string, unknown>
    | undefined;
  const claimId =
    (data?.claim_id as string | undefined) ??
    (data?.claimId as string | undefined);
  if (claimId) {
    router.push(`/claim/${claimId}` as any);
    return;
  }
  router.push('/(tabs)/queue' as any);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();
  const router = useRouter();

  // Cold start: if the app was opened by tapping a notification, this returns
  // the response that launched it. We route once on mount, then use a ref to
  // guarantee we don't re-route if the hook re-runs for any reason.
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    if (handledColdStartRef.current) return;
    if (lastResponse) {
      handledColdStartRef.current = true;
      routeFromNotification(lastResponse, router);
    }
  }, [lastResponse, router]);

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        storePushToken(token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      () => {
        // Foreground delivery — the notification handler set above surfaces
        // a banner automatically; nothing else to do until the user taps it.
      }
    );

    // Warm path: app already running, user taps a notification banner.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        routeFromNotification(response, router);
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);

  return { expoPushToken };
}

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('governance', {
      name: 'Governance Queue',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return token.data;
}

async function storePushToken(token: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Upsert to operator_profiles — Edge Function reads this for push delivery
  const { error } = await supabase.schema('intel').from('operator_profiles').upsert(
    {
      user_id: user.id,
      expo_push_token: token,
    },
    { onConflict: 'user_id' }
  );

  if (error && __DEV__) console.warn('Failed to store push token:', error.message);
}
