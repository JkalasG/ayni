import { useEffect } from "react";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Unbounded_500Medium, Unbounded_700Bold, Unbounded_800ExtraBold } from "@expo-google-fonts/unbounded";
import { Figtree_400Regular, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { SchemeProvider, useScheme } from "@/lib/scheme";
import { fonts } from "@/lib/theme";
import { ModeBanner } from "@/components/mode-banner";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/icons";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Unbounded_500Medium,
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
    Figtree_400Regular,
    Figtree_700Bold,
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

/**
 * Back arrow of every screen with a header. It also works when the screen was opened directly (a link, a reload,
 * the PayPal return), where there is no history: then it goes to the screen's parent instead of leaving the
 * person with no way out.
 */
function HeaderBack() {
  const { c } = useScheme();
  const { t } = useI18n();
  const path = usePathname();
  if (path === "/notifications") return <View style={{ width: 12 }} />; // a tab, not a sub-screen: only keep the title aligned
  const inGroup = path.match(/^\/groups\/([^/]+)\/.+/);
  const parent = inGroup && inGroup[1] !== "new" ? `/groups/${inGroup[1]}` : path.startsWith("/payments") || path.startsWith("/connect") ? "/profile" : "/groups";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("back")}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(parent as any))}
      style={({ pressed, hovered }: any) => ({ width: 44, height: 44, marginRight: 4, alignItems: "center", justifyContent: "center", backgroundColor: pressed || hovered ? c.surfaceAlt : "transparent" })}
    >
      <Icon name="atras" size={18} color={c.ink} />
    </Pressable>
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
            // never the raw route name ("groups/[id]/index") while a screen is still loading
            title: "",
            headerBackVisible: false,
            headerLeft: () => <HeaderBack />,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          {/* a group draws its own top: name, state and the menu of its views (see groups/[id]/_layout) */}
          <Stack.Screen name="groups/[id]" options={{ headerShown: false }} />
        </Stack>
      </Shell>
    </>
  );
}
