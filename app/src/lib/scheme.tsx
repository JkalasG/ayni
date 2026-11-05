import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { dawn, night, setActivePalette, type Palette } from "./theme";

export type SchemePref = "system" | "light" | "dark";
const KEY = "ayni_scheme";

async function readPref(): Promise<SchemePref> {
  try {
    const v = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
async function writePref(p: SchemePref) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, p);
    else await SecureStore.setItemAsync(KEY, p);
  } catch {}
}

const Ctx = createContext<{ c: Palette; pref: SchemePref; setPref: (p: SchemePref) => void }>({
  c: dawn,
  pref: "system",
  setPref: () => {},
});

/** Follows the system ("Noche andina" / "Amanecer andino") unless the person picks one; saved on the device. */
export function SchemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<SchemePref>("system");
  useEffect(() => {
    readPref().then(setPrefState);
  }, []);
  const value = useMemo(() => {
    const dark = pref === "dark" || (pref === "system" && system === "dark");
    const c = dark ? night : dawn;
    setActivePalette(c);
    return {
      c,
      pref,
      setPref: (p: SchemePref) => {
        setPrefState(p);
        writePref(p);
      },
    };
  }, [pref, system]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useScheme = () => useContext(Ctx);
