import { View } from "react-native";
import { Chips, Field, Toggle } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export type AdmissionMode = "MANUAL" | "AUTO" | "AI";

/** Form state is kept as strings so empty fields stay empty while typing. */
export type AdmissionValues = {
  isOpen: boolean;
  description: string;
  admissionMode: AdmissionMode;
  minCompleted: string;
  minOnTimePct: string;
  maxLate: string;
  acceptNewcomers: boolean;
  requireDeposit: boolean;
};

export const defaultAdmission: AdmissionValues = {
  isOpen: false,
  description: "",
  admissionMode: "AI",
  minCompleted: "1",
  minOnTimePct: "80",
  maxLate: "1",
  acceptNewcomers: true,
  requireDeposit: true,
};

const int = (v: string, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** What the API expects. */
export function admissionPayload(v: AdmissionValues) {
  return {
    isOpen: v.isOpen,
    description: v.description.trim() || null,
    admissionMode: v.admissionMode,
    minCompleted: int(v.minCompleted),
    minOnTimePct: Math.min(100, int(v.minOnTimePct)),
    maxLate: v.maxLate.trim() === "" ? null : int(v.maxLate),
    acceptNewcomers: v.acceptNewcomers,
    requireDeposit: v.requireDeposit,
  };
}

export function fromGroup(g: any): AdmissionValues {
  return {
    isOpen: !!g.isOpen,
    description: g.description ?? "",
    admissionMode: g.admissionMode ?? "AI",
    minCompleted: String(g.minCompleted ?? 0),
    minOnTimePct: String(g.minOnTimePct ?? 0),
    maxLate: g.maxLate == null ? "" : String(g.maxLate),
    acceptNewcomers: g.acceptNewcomers ?? true,
    requireDeposit: g.requireDeposit ?? true,
  };
}

export function AdmissionForm({ value, onChange }: { value: AdmissionValues; onChange: (v: AdmissionValues) => void }) {
  const { t } = useI18n();
  const set = <K extends keyof AdmissionValues>(k: K, v: AdmissionValues[K]) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 16 }}>
      <Toggle label={t("openGroup")} value={value.isOpen} onChange={(v) => set("isOpen", v)} />
      {value.isOpen && (
        <>
          <Field label={t("description")} value={value.description} onChangeText={(v) => set("description", v)} multiline maxLength={400} />
          <Chips
            label={t("admissionMode")}
            value={value.admissionMode}
            onChange={(v) => set("admissionMode", v)}
            options={[
              { value: "AI", label: t("AI_ADMIT") },
              { value: "AUTO", label: t("AUTO") },
              { value: "MANUAL", label: t("MANUAL") },
            ]}
          />
          <Field label={t("minCompleted")} value={value.minCompleted} onChangeText={(v) => set("minCompleted", v)} keyboardType="number-pad" />
          <Field label={t("minOnTimePct")} value={value.minOnTimePct} onChangeText={(v) => set("minOnTimePct", v)} keyboardType="number-pad" />
          <Field label={t("maxLate")} value={value.maxLate} onChangeText={(v) => set("maxLate", v)} keyboardType="number-pad" />
          <Toggle label={t("acceptNewcomers")} value={value.acceptNewcomers} onChange={(v) => set("acceptNewcomers", v)} />
          <Toggle label={t("requireDeposit")} value={value.requireDeposit} onChange={(v) => set("requireDeposit", v)} />
        </>
      )}
    </View>
  );
}
