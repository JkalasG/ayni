import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Unbounded_500Medium, Unbounded_700Bold, Unbounded_800ExtraBold } from "@expo-google-fonts/unbounded";
import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from "@expo-google-fonts/atkinson-hyperlegible";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { SchemeProvider, useScheme } from "@/lib/scheme";
import { fonts } from "@/lib/theme";
import { ModeBanner } from "@/components/mode-banner";
import { Shell } from "@/components/shell";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Unbounded_500Medium,
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <SchemeProvider>
      <I18nProvider>
        <AuthProvider>
          <Navigator />
          {Platform.OS !== "web" && <ModeBanner />}
        </AuthProvider>
      </I18nProvider>
      </SchemeProvider>
    </SafeAreaProvider>
  );
}

/** Inside the providers so headers and the status bar follow the color mode. */
function Navigator() {
  const { c } = useScheme();
  return (
    <>
      <StatusBar style={c.scheme === "dark" ? "light" : "dark"} />
      {Platform.OS === "web" && <ModeBanner />}
      <Shell>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.ink,
            headerTitleStyle: { fontFamily: fonts.display, fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        </Stack>
      </Shell>
    </>
  );
}
