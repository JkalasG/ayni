/** Native fallback: the calendar is drawn by Bryntum Scheduler, which needs the browser (payment-calendar.web.tsx). */
import { Notice } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { CalendarProps } from "./payment-calendar-types";

export function PaymentCalendar(_: CalendarProps) {
  const { t } = useI18n();
  return <Notice>{t("calWebOnly")}</Notice>;
}
