import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { API_URL, api } from "./api";
import { getToken, setToken } from "./session";
import { useI18n } from "./i18n";

export type Me = { id: string; name: string; email: string; locale: "es" | "en" };

type AuthState = {
  me: Me | null;
  loading: boolean;
  loginWithPayPal: () => Promise<void>;
  loginAsDemo: (userId: string) => Promise<void>;
  acceptToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { lang } = useI18n();

  const refresh = useCallback(async () => {
    try {
      if (!(await getToken())) return setMe(null);
      setMe(await api<Me>("/me"));
    } catch {
      await setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // keep the assistant's language in sync with the app language
  useEffect(() => {
    if (me && me.locale !== lang) api("/me", { method: "PATCH", body: { locale: lang } }).catch(() => {});
  }, [lang, me]);

  const acceptToken = useCallback(
    async (token: string) => {
      await setToken(token);
      await refresh();
    },
    [refresh]
  );

  const loginWithPayPal = useCallback(async () => {
    if (Platform.OS === "web") {
      // full-page redirect; /auth picks up the token
      const redirect = `${window.location.origin}/auth`;
      window.location.href = `${API_URL}/auth/paypal/start?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("auth");
    const result = await WebBrowser.openAuthSessionAsync(
      `${API_URL}/auth/paypal/start?redirect=${encodeURIComponent(redirect)}`,
      redirect
    );
    if (result.type === "success") {
      const token = Linking.parse(result.url).queryParams?.token;
      if (typeof token === "string") await acceptToken(token);
    }
  }, [acceptToken]);

  const loginAsDemo = useCallback(
    async (userId: string) => {
      const { token } = await api<{ token: string }>("/auth/demo", { body: { userId } });
      await acceptToken(token);
    },
    [acceptToken]
  );

  const logout = useCallback(async () => {
    await setToken(null);
    setMe(null);
  }, []);

  return (
    <Ctx.Provider value={{ me, loading, loginWithPayPal, loginAsDemo, acceptToken, logout }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
