import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Set up Android notification channels with alarm sounds
 * Must be called before any notifications are sent
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Regular reminder channel - uses gentle bell chime
  await Notifications.setNotificationChannelAsync('reminder_channel', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3DBDA7',
    sound: 'gentle_bell_chime.mp3',
    enableVibrate: true,
    enableLights: true,
  });

  // Emergency/important reminder channel - uses urgent alarm
  await Notifications.setNotificationChannelAsync('emergency_channel', {
    name: 'Important Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#E53935',
    sound: 'urgent_alarm_sound.mp3',
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true,
  });

  console.log('Notification channels configured');
}

/**
 * Register for push notifications and get FCM token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // Set up notification channels first (Android only)
  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }
  }

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData?.data ?? null;
    console.log('FCM Token obtained:', token ? 'Yes' : 'No');
    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register FCM token with backend Cloud Function
 */
export async function registerFCMTokenWithBackend(token: string): Promise<void> {
  try {
    const registerFCMToken = httpsCallable(functions, 'registerFCMToken');
    await registerFCMToken({ fcmToken: token });
  } catch (err) {
    console.warn('registerFCMToken Cloud Function may not be deployed:', err);
  }
}

/**
 * Update FCM token in user's document (for caregivers)
 */
export async function updateUserFCMToken(userId: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { fcmToken: token });
}

/**
 * Update FCM token in elderly's document
 */
export async function updateElderlyFCMToken(elderlyId: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'elderly', elderlyId), { fcmToken: token });
  console.log('Elderly FCM token saved:', elderlyId);
}

/**
 * Set up push notifications for caregiver
 */
export async function setupPushNotifications(userId: string): Promise<void> {
  const token = await registerForPushNotifications();
  if (token) {
    await updateUserFCMToken(userId, token);
    await registerFCMTokenWithBackend(token);
  }
}

/**
 * Set up push notifications for elderly
 */
export async function setupElderlyPushNotifications(elderlyId: string): Promise<string | null> {
  const token = await registerForPushNotifications();
  if (token) {
    await updateElderlyFCMToken(elderlyId, token);
  }
  return token;
}

/**
 * Add listener for notification responses (when user taps notification)
 * Returns cleanup function
 */
export function addNotificationResponseListener(
  callback: (reminderId: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const reminderId = data?.reminderId as string | undefined;

    if (reminderId) {
      console.log('Notification tapped, reminderId:', reminderId);
      callback(reminderId);
    }
  });

  return () => subscription.remove();
}

/**
 * Add listener for notifications received while app is in foreground
 * Returns cleanup function
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(callback);
  return () => subscription.remove();
}
