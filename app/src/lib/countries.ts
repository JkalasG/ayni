/**
 * Countries a pasanaku can be based in: Latin America and the main destinations of its diaspora.
 * Must match COUNTRIES in backend/src/routes.ts.
 */
import type { Lang } from "@/lib/i18n";

export const COUNTRIES = ["BO", "PE", "AR", "CL", "BR", "PY", "EC", "CO", "MX", "US", "ES", "IT"] as const;
export type Country = (typeof COUNTRIES)[number];

const NAMES: Record<Lang, Record<Country, string>> = {
  es: {
    AR: "Argentina",
    BO: "Bolivia",
    BR: "Brasil",
    CL: "Chile",
    CO: "Colombia",
    EC: "Ecuador",
    MX: "México",
    PE: "Perú",
    PY: "Paraguay",
    US: "Estados Unidos",
    ES: "España",
    IT: "Italia",
  },
  en: {
    AR: "Argentina",
    BO: "Bolivia",
    BR: "Brazil",
    CL: "Chile",
    CO: "Colombia",
    EC: "Ecuador",
    MX: "Mexico",
    PE: "Peru",
    PY: "Paraguay",
    US: "United States",
    ES: "Spain",
    IT: "Italy",
  },
};

export const countryName = (code: string, lang: Lang) => NAMES[lang][code as Country] ?? code;

/** Where each country's label and threads sit on the world map: [longitude, latitude]. */
export const ANCHOR: Record<Country, [lon: number, lat: number]> = {
  US: [-98, 39],
  MX: [-102, 23],
  CO: [-73, 4],
  EC: [-78, -1.5],
  PE: [-75, -10],
  BR: [-52, -10],
  BO: [-65, -17],
  PY: [-58, -23],
  CL: [-71, -33],
  AR: [-64, -35],
  ES: [-4, 40],
  IT: [12.5, 42.5],
};
