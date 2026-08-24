import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import api from "../api/client";

/**
 * Registers this device for FCM and sends the REAL native device token to the
 * backend (PUT /me/device-tokens). The backend pushes via firebase-admin, so we
 * must use the native FCM token (getDevicePushTokenAsync), not an Expo token.
 * Requires a dev/production build with google-services.json (won't work in Expo Go).
 */
export async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#1B4332",
      });
    }

    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;

    const tokenResp = await Notifications.getDevicePushTokenAsync(); // native FCM token on Android
    const token = tokenResp?.data;
    if (!token) return null;

    await api.put("/me/device-tokens", {
      token,
      platform: Platform.OS,
      device_id: Device.osInternalBuildId || Device.modelName || undefined,
    });
    return token;
  } catch (e) {
    // Non-fatal: in-app notifications still work without push.
    return null;
  }
}

/** Wire foreground receipt + tap handling. onDeepLink(path) fires when a user taps a push. */
export function addNotificationListeners(onDeepLink) {
  const received = Notifications.addNotificationReceivedListener(() => {});
  const responded = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    const path = data.deep_link || data.deepLink;
    if (path) onDeepLink && onDeepLink(String(path));
  });
  return () => {
    received.remove();
    responded.remove();
  };
}
