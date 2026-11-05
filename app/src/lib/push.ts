import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

// Show reminders even while the app is open.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android push: ask permission, get the Expo push token, send it to the backend.
 * Never throws: without push the app keeps the in-app notifications.
 * Needs an EAS project id (eas init) and FCM credentials in the APK build; Expo Go on
 * Android does not support remote push, so this is a no-op there.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return;
    if (Constants.executionEnvironment === "storeClient") return; // Expo Go
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Ayni",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/me/push-token", { body: { token: data } });
  } catch (e) {
    console.warn("push registration skipped", e);
  }
}

export async function unregisterPush(): Promise<void> {
  if (Platform.OS === "web") return;
  await api("/me/push-token", { body: { token: null } }).catch(() => {});
}
