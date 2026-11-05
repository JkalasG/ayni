import { Text, View } from "react-native";
import { Badge, Card, H2, P } from "@/components/ui";
import { useI18n, type Key } from "@/lib/i18n";
import { colors, fonts } from "@/lib/theme";
import { Icon } from "@/components/icons";

export type TrustProfile = {
  completed: number;
  abandoned: number;
  activeGroups: number;
  onTime: number;
  late: number;
  covered: number;
  defaulted: number;
  onTimePct: number | null;
  accountAgeDays: number;
  paypalVerified: boolean;
  isNewcomer: boolean;
  riskScore: number;
};

export type AdmissionCheck = { meets: boolean; borderline: boolean; failures: string[] };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surfaceAlt, borderRadius: 8, padding: 12, gap: 2 }}>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color: tone ?? colors.ink, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>{label}</Text>
    </View>
  );
}

/** The public trust profile: payment behaviour inside Ayni only. */
export function TrustCard({ profile, title }: { profile: TrustProfile; title?: string }) {
  const { t } = useI18n();
  const riskColor = profile.riskScore <= 35 ? colors.leaf : profile.riskScore <= 60 ? colors.corn : colors.danger;
  return (
    <Card>
      {title ? <H2>{title}</H2> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Badge text={profile.paypalVerified ? t("verified") : t("notVerified")} color={profile.paypalVerified ? colors.sky : colors.danger} />
        {profile.isNewcomer && <Badge text={t("newcomer")} color={colors.leaf} />}
        <Badge text={`${t("risk")} ${profile.riskScore}/100`} color={riskColor} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Stat label={t("completed")} value={String(profile.completed)} tone={colors.leaf} />
        <Stat label={t("abandoned")} value={String(profile.abandoned)} tone={profile.abandoned ? colors.danger : undefined} />
        <Stat label={t("onTimePct")} value={profile.onTimePct == null ? t("noHistory") : `${profile.onTimePct}%`} />
        <Stat label={t("lates")} value={String(profile.late)} tone={profile.late ? colors.corn : undefined} />
        <Stat label={t("guaranteeUsed")} value={String(profile.covered)} />
        <Stat label={t("accountAge")} value={`${profile.accountAgeDays} ${t("days")}`} />
      </View>
    </Card>
  );
}

/** Each admission rule with ✔ / ✘, so the applicant (or organizer) sees exactly why. */
export function RuleChecklist({
  check,
  rules,
  profile,
}: {
  check: AdmissionCheck;
  rules: { minCompleted: number; minOnTimePct: number; maxLate: number | null; acceptNewcomers: boolean };
  profile?: TrustProfile;
}) {
  const { t } = useI18n();
  const rows: { key: string; label: string }[] = [{ key: "not_verified", label: t("rule_not_verified") }, { key: "has_abandoned", label: t("rule_has_abandoned") }];
  if (profile?.isNewcomer) {
    rows.push({ key: "newcomers_not_accepted", label: rules.acceptNewcomers ? t("newcomerNote") : t("rule_newcomers_not_accepted") });
  } else {
    if (rules.minCompleted > 0) rows.push({ key: "min_completed", label: `${t("rule_min_completed")} ≥ ${rules.minCompleted}${profile ? ` (${profile.completed})` : ""}` });
    if (rules.minOnTimePct > 0)
      rows.push({ key: "min_on_time", label: `${t("rule_min_on_time")} ≥ ${rules.minOnTimePct}%${profile ? ` (${profile.onTimePct ?? 0}%)` : ""}` });
    if (rules.maxLate != null) rows.push({ key: "max_late", label: `${t("rule_max_late")} ≤ ${rules.maxLate}${profile ? ` (${profile.late})` : ""}` });
  }
  return (
    <View style={{ gap: 4 }}>
      {rows.map((r) => {
        const fail = check.failures.includes(r.key);
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${fail ? t("notMet") : t("met")}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={fail ? "rechazar" : "aprobar"} size={14} color={fail ? colors.danger : colors.paid} />
            <P style={{ flex: 1, color: fail ? colors.danger : colors.ink, fontSize: 14.5 }}>{r.label}</P>
          </View>
        );
      })}
    </View>
  );
}

export function checkLabel(check: AdmissionCheck, t: (k: Key) => string) {
  if (check.meets) return { text: t("youMeet"), color: colors.leaf };
  if (check.borderline) return { text: t("borderline"), color: colors.corn };
  return { text: t("youDontMeet"), color: colors.danger };
}
