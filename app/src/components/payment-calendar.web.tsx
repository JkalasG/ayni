/**
 * Payment calendar (web): one row per member, one bar per round. The bar is that member's contribution to that round
 * (paid, pending, late...) and it spans the round's time window. A star marks the member who receives the pot.
 * Built with Bryntum Scheduler. Read-only: nothing can be dragged or edited here.
 */
import { createElement, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { CalendarProps } from "./payment-calendar-types";
import { cellState, type CellState } from "@/lib/calendar";
import { HOST_STYLE, esc, loadScheduler, presetFor, roundWindows } from "./bryntum-web";

const COLORS: Record<CellState, string> = { paid: "green", covered: "teal", pending: "orange", late: "red", upcoming: "gray", closed: "deep-purple" };

function buildData(p: CalendarProps) {
  const { windows, startDate, endDate } = roundWindows(p.rounds, p.startsAt);
  const viewer = { isOrganizer: p.isOrganizer, myMembershipId: p.myMembershipId };
  const resources = [...p.members]
    .filter((m) => m.turn != null)
    .sort((a, b) => a.turn! - b.turn!)
    .map((m) => ({ id: m.id, name: m.id === p.myMembershipId ? `${m.name} (${p.labels.mine})` : m.name }));
  const nameOf = (id: string) => p.members.find((m) => m.id === id)?.name ?? "";
  const events = p.rounds.flatMap((r) =>
    r.contributions.map((c) => {
      const state = cellState(c, r, viewer, p.now);
      const w = windows.get(r.number)!;
      return {
        id: `${r.number}:${c.membershipId}`,
        resourceId: c.membershipId,
        startDate: w.start,
        endDate: w.end,
        name: `${r.recipientId === c.membershipId ? "★ " : ""}${p.money(c.amountCents + c.lateFeeCents)}`,
        eventColor: COLORS[state],
        draggable: false,
        resizable: false,
        state,
        round: r.number,
        recipient: nameOf(r.recipientId),
        lateFeeCents: c.lateFeeCents,
        paidAt: c.paidAt,
        isRecipient: r.recipientId === c.membershipId,
      };
    })
  );
  return { resources, events, startDate, endDate };
}

export function PaymentCalendar(props: CalendarProps) {
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
      const when = (iso: string) => new Date(iso).toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      scheduler.current = new Scheduler({
        appendTo: host.current,
        height: Math.max(220, 90 + data.resources.length * 52),
        rowHeight: 48,
        barMargin: 5,
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
              const lines = [`<b>${esc(l.round)} ${e.round}</b> · ${esc(l.state[e.state as CellState])}`];
              lines.push(e.isRecipient ? `★ ${esc(l.receives)}` : `${esc(l.receives)}: ${esc(e.recipient)}`);
              if (e.lateFeeCents > 0) lines.push(`${esc(l.lateFee)}: ${esc(latest.current.money(e.lateFeeCents))}`);
              lines.push(e.paidAt ? `${esc(l.paidOn)}: ${esc(when(e.paidAt))}` : `${esc(l.due)}: ${esc(when(e.endDate.toISOString()))}`);
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

  // New data from the server: the bars change color without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
  }, [props.rounds, props.members, props.myMembershipId, props.isOrganizer, props.now]);

  useEffect(() => {
    scheduler.current?.refreshWithTransition?.();
  }, [width]);

  return createElement("div", { ref: host, style: HOST_STYLE });
}
