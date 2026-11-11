/** Native fallback: the timeline is drawn by Bryntum Scheduler, which needs the browser (guarantee-timeline.web.tsx). */
import { Notice } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { GuaranteeProps } from "./guarantee-timeline-types";

export function GuaranteeTimeline(_: GuaranteeProps) {
  const { t } = useI18n();
  return <Notice>{t("gtWebOnly")}</Notice>;
}
