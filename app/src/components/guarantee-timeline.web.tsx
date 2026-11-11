/**
 * Guarantee timeline (web): one row per member. A bar is the time a guarantee was kept (from the moment it was withheld
 * from their pot until it went back to their PayPal; still open if it has not). Diamonds mark what happened on the way:
 * used to cover a contribution, used to close an unpaid one, returned, refunded. Read-only.
 * Built with Bryntum Scheduler. Who sees which row is decided by the server: a member only gets their own.
 */
import { createElement, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { GuaranteeItem, GuaranteeKind, GuaranteeProps } from "./guarantee-timeline-types";
import { HOST_STYLE, esc, loadScheduler, presetFor } from "./bryntum-web";

const COLORS: Record<GuaranteeKind, string> = { HELD: "teal", USED: "orange", RECOVERED: "red", RETURNED: "green", REFUND: "deep-purple" };

function buildData(p: GuaranteeProps) {
  const resources = [...p.members]
    .sort((a, b) => (a.turn ?? 99) - (b.turn ?? 99))
    .map((m) => ({ id: m.id, name: m.id === p.myMembershipId ? `${m.name} (${p.labels.mine})` : m.name }));
  const times = p.items.flatMap((i) => [new Date(i.at).getTime(), i.until ? new Date(i.until).getTime() : 0]).filter(Boolean);
  const first = Math.min(...(p.startsAt ? [new Date(p.startsAt).getTime()] : []), ...times, p.now);
  const last = Math.max(...(p.endsAt ? [new Date(p.endsAt).getTime()] : []), ...times, p.now);
  const pad = Math.max((last - first) * 0.08, 60_000);
  const events = p.items.flatMap((i: GuaranteeItem) => {
    const start = new Date(i.at);
    const open = i.kind === "HELD" && !i.until;
    // A guarantee that is still held is drawn up to "now" and keeps growing.
    const end = i.kind === "HELD" ? new Date(Math.max(i.until ? new Date(i.until).getTime() : p.now, start.getTime() + 60_000)) : start;
    // Still held: the rest of the pasanaku is shown in gray, "it goes back when the group ends and you have paid everything".
    const later =
      open && p.endsAt && new Date(p.endsAt).getTime() > end.getTime()
        ? [{ id: `${i.id}:later`, resourceId: i.membershipId, startDate: end, endDate: new Date(p.endsAt), name: p.labels.back, eventColor: "gray", draggable: false, resizable: false, kind: "LATER", round: null, amountCents: i.amountCents, open: false }]
        : [];
    return [{
      id: i.id,
      resourceId: i.membershipId,
      startDate: start,
      endDate: end,
      name: open ? `${p.money(i.amountCents)} · ${p.labels.stillHeld}` : i.status === "FAILED" ? `${p.money(i.amountCents)} · ${p.labels.failed}` : p.money(i.amountCents),
      eventColor: i.status === "FAILED" ? "gray" : COLORS[i.kind],
      draggable: false,
      resizable: false,
      kind: i.kind,
      round: i.round,
      amountCents: i.amountCents,
      open,
    }, ...later];
  });
  return { resources, events, startDate: new Date(first - pad), endDate: new Date(last + pad) };
}

export function GuaranteeTimeline(props: GuaranteeProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const scheduler = useRef<any>(null);
  const latest = useRef(props);
  latest.current = props;
  const { width } = useWindowDimensions();

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!host.current) return;
      const Scheduler = await loadScheduler(props.dark);
      if (disposed || !host.current) return;
      const data = buildData(latest.current);
      const when = (d: Date) => d.toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      scheduler.current = new Scheduler({
        appendTo: host.current,
        height: Math.max(220, 90 + data.resources.length * 62),
        rowHeight: 56,
        barMargin: 8,
        startDate: data.startDate,
        endDate: data.endDate,
        viewPreset: presetFor(data.startDate, data.endDate),
        readOnly: true,
        columns: [{ text: latest.current.labels.member, field: "name", width: 170 }],
        resources: data.resources,
        events: data.events,
        features: {
          eventDrag: false,
          eventResize: false,
          eventEdit: false,
          eventDragCreate: false,
          eventMenu: false,
          scheduleMenu: false,
          timeAxisHeaderMenu: false,
          cellEdit: false,
          columnReorder: false,
          columnResize: false,
          timeRanges: { showCurrentTimeLine: true },
          eventTooltip: {
            template: ({ eventRecord: e }: any) => {
              const l = latest.current.labels;
              if (e.kind === "LATER") return `<b>${esc(l.back)}</b>`;
              const lines = [`<b>${esc(l.kind[e.kind as GuaranteeKind])}</b> · ${esc(latest.current.money(e.amountCents))}`];
              if (e.round != null) lines.push(`${esc(l.round)} ${e.round}`);
              lines.push(e.kind === "HELD" ? (e.open ? esc(l.stillHeld) : `${esc(l.until)}: ${esc(when(e.endDate))}`) : esc(when(e.startDate)));
              return lines.join("<br>");
            },
          },
        },
      });
    })();
    return () => {
      disposed = true;
      scheduler.current?.destroy();
      scheduler.current = null;
    };
  }, [props.dark]);

  // New data from the server: the bars grow or close without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
    s.setTimeSpan(data.startDate, data.endDate);
  }, [props.items, props.members, props.myMembershipId, props.now]);

  useEffect(() => {
    scheduler.current?.refreshWithTransition?.();
  }, [width]);

  return createElement("div", { ref: host, style: HOST_STYLE });
}
