import { Platform, useWindowDimensions } from "react-native";

/** Below this width the app is a phone app; above it (web on a computer) it gets the sidebar layout. */
export const WIDE = 960;

export function useLayout() {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= WIDE;
  return { width, wide, phone: !wide };
}
