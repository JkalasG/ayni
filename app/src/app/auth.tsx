import { useEffect } from "react";
import { useScheme } from "@/lib/scheme";
import { router, useLocalSearchParams } from "expo-router";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Landing page for the Log in with PayPal redirect (web), and deep link target (native). */
export default function AuthCallback() {
  useScheme(); // re-render when the color mode changes
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { acceptToken } = useAuth();

  useEffect(() => {
    (async () => {
      if (token) await acceptToken(token);
      router.replace("/groups");
    })();
  }, [token, acceptToken]);

  return <Loading />;
}
