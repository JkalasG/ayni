import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Small per-device flags (e.g. "this celebration was already shown"). Never critical state. */
export async function getFlag(key: string): Promise<boolean> {
  try {
    const v = Platform.OS === "web" ? globalThis.localStorage?.getItem(key) : await SecureStore.getItemAsync(key);
    return v === "1";
  } catch {
    return false;
  }
}
export async function setFlag(key: string) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, "1");
    else await SecureStore.setItemAsync(key, "1");
  } catch {}
}

export async function getValue(key: string): Promise<string | null> {
  try {
    return Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
export async function setValue(key: string, value: string) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {}
}
