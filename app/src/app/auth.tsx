import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Landing page for the Log in with PayPal redirect (web), and deep link target (native). */
export default function AuthCallback() {
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
