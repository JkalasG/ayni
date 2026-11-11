/**
 * Native fallback. The drag-and-drop timeline (Bryntum Scheduler) draws on the browser's DOM, so it exists only in the
 * web build (turn-timeline.web.tsx). On the phone the group screen already shows every turn in the weave.
 */
import { Notice } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { TimelineProps } from "./turn-timeline-types";

export function TurnTimeline(_: TimelineProps) {
  const { t } = useI18n();
  return <Notice>{t("tlWebOnly")}</Notice>;
}
