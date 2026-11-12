/**
 * Payment calendar (web): one row per member, one COLUMN per round. Each cell is that member's contribution to that
 * round: an icon, the amount and the state in words, with a strip of woven cloth along its edge that says the same
 * thing in the app's visual language (twill = woven, loose threads = still to weave, hatch = late...). Whoever receives
 * the pot that round has a gold border and a star. The round in progress is shaded, and the bottom row adds up what
 * has been collected in each round. Read-only: nothing can be dragged or edited here.
 * Built with Bryntum Scheduler. Who sees which state is decided by the server and by cellState (see lib/calendar.ts).
 */
import { createElement, useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import type { CalendarProps } from "./payment-calendar-types";
import { cellState, type CellState } from "@/lib/calendar";
import { CELL_HUE } from "@/lib/sched-colors";
import { HOST_STYLE, chartToolbar, esc, loadScheduler, memberColumn, memberColumnWidth, paletteOf, progressColumn, roundPreset, roundWindows, setStatus, statusBar, tipHtml, type Texture } from "./bryntum-web";

const ICON: Record<CellState, string> = { paid: "check", covered: "shield-halved", pending: "clock", late: "triangle-exclamation", upcoming: "hourglass-half", closed: "ban" };
const TEXTURE: Record<CellState, Texture> = { paid: "twill", covered: "twill", pending: "threads", late: "hatch", upcoming: "hair", closed: "dots" };

function buildData(p: CalendarProps) {
  const { sorted, windows, gap, startDate, endDate } = roundWindows(p.rounds);
  const viewer = { isOrganizer: p.isOrganizer, myMembershipId: p.myMembershipId };
  const nameOf = (id: string) => p.members.find((m) => m.id === id)?.name ?? "";
  const settled = (s: CellState) => s === "paid" || s === "covered";

  const events = sorted.flatMap((r) =>
    r.contributions.map((c) => {
      const state = cellState(c, r, viewer, p.now);
      const w = windows.get(r.number)!;
      const total = c.amountCents + c.lateFeeCents;
      const recipient = r.recipientId === c.membershipId;
      return {
        id: `${r.number}:${c.membershipId}`,
        resourceId: c.membershipId,
        startDate: w.start,
        endDate: w.end,
        name: `${p.labels.short[state]} · ${p.money(total)}`,
        cls: `ay-card ay-${CELL_HUE[state]} ay-t-${TEXTURE[state]}${recipient ? " ay-recipient" : ""}`,
        draggable: false,
        resizable: false,
        state,
        round: r.number,
        label: p.money(total),
        recipientName: nameOf(r.recipientId),
        isRecipient: recipient,
        lateFeeCents: c.lateFeeCents,
        paidAt: c.paidAt,
        // what this cell adds to the "collected" row: only contributions already in
        paidCents: settled(state) ? total : 0,
        totalCents: total,
      };
    })
  );

  // First row: the pot of each round and who receives it, so "who collects when" reads straight off the chart
  const POT = "__pot";
  const userOf = (membershipId: string) => p.members.find((m) => m.id === membershipId)?.userId ?? membershipId;
  const potEvents = sorted.map((r) => {
    const w = windows.get(r.number)!;
    const total = r.contributions.reduce((s, x) => s + x.amountCents + x.lateFeeCents, 0);
    const collected = r.contributions.reduce((s, x) => s + (x.status === "PAID" || x.status === "COVERED" ? x.amountCents + x.lateFeeCents : 0), 0);
    const first = nameOf(r.recipientId).replace(/^(Doña|Don)\s+/i, "").split(" ")[0];
    return {
      id: `pot:${r.number}`,
      resourceId: POT,
      startDate: w.start,
      endDate: w.end,
      name: `${p.money(total)} → ${first}`,
      cls: `ay-card ay-amarillo ay-t-${r.status === "PAID_OUT" ? "twill" : r.status === "UPCOMING" ? "hair" : "threads"}`,
      draggable: false,
      resizable: false,
      isPot: true,
      state: "pot",
      status: r.status,
      round: r.number,
      label: p.money(total),
      recipientName: nameOf(r.recipientId),
      recipientUser: userOf(r.recipientId),
      recipientFirst: first,
      collected,
      total,
      // the pot row adds nothing to the "collected" row at the bottom
      paidCents: 0,
      totalCents: 0,
    };
  });

  const paidBy = new Map<string, number>();
  for (const e of events) if (settled(e.state)) paidBy.set(e.resourceId, (paidBy.get(e.resourceId) ?? 0) + 1);
  const resources = [...p.members]
    .filter((m) => m.turn != null)
    .sort((a, b) => a.turn! - b.turn!)
    .map((m) => {
      const me = m.id === p.myMembershipId;
      const turn = `${p.labels.turnWord} R${m.turn}`;
      return { id: m.id, name: m.name, avatarId: m.userId ?? m.id, isMe: me, sub: me ? `${p.labels.mine} · ${turn}` : turn, paid: paidBy.get(m.id) ?? 0, total: sorted.length };
    });

  // The round collecting now is shaded, and the "current round" button scrolls to it.
  const current = sorted.find((r) => r.status === "COLLECTING") ?? sorted.find((r) => r.status === "READY");
  const cw = current ? windows.get(current.number)! : null;
  const ranges = cw ? [{ id: "current", name: "", startDate: cw.start, endDate: cw.end, cls: "ay-current-round" }] : [];
  const status = current ? `<b>${esc(p.labels.roundOf(current.number, sorted.length))}</b>` : "";
  const potRow = sorted.length ? [{ id: POT, name: p.labels.pot, sub: p.labels.potSub, avatarId: "", isMe: false, isPot: true }] : [];
  return { resources: [...potRow, ...resources], events: [...potEvents, ...events], ranges, windows, gap, startDate, endDate, status, focus: cw?.start ?? null };
}

/** What shows while the chart engine loads and draws: the shape of the table, so the screen does not jump. */
function Skeleton({ dark }: { dark: boolean }) {
  const c = paletteOf(dark);
  const block = (w: string, h: number, extra: Record<string, unknown> = {}) => createElement("div", { style: { width: w, height: h, background: c.line, opacity: 0.55, animation: "ay-pulse 1.2s ease-in-out infinite", ...extra } });
  const row = (i: number) =>
    createElement(
      "div",
      { key: i, style: { display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", borderTop: `1px solid ${c.line}` } },
      block("200px", 42),
      ...[0, 1, 2, 3].map((k) => block("100%", 42, { flex: 1, key: k }))
    );
  return createElement(
    "div",
    { "aria-busy": "true", style: { border: `2px solid ${c.line}`, background: c.surface } },
    createElement("style", null, "@keyframes ay-pulse { 0%,100% { opacity: .35 } 50% { opacity: .7 } }"),
    createElement("div", { style: { display: "flex", gap: 10, padding: 12 } }, block("120px", 36), createElement("div", { style: { flex: 1 } }), block("160px", 36), block("90px", 36)),
    ...[0, 1, 2, 3, 4, 5].map(row)
  );
}

export function PaymentCalendar(props: CalendarProps) {
  const [ready, setReady] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const scheduler = useRef<any>(null);
  const focus = useRef<Date | null>(null);
  const lastSig = useRef("");
  const latest = useRef(props);
  latest.current = props;
  const { width } = useWindowDimensions();
  // The scale is sized from the width, so it is built again when the window changes noticeably.
  const widthBucket = Math.round(width / 48);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!host.current) return;
      const Scheduler = await loadScheduler(props.dark);
      if (disposed || !host.current) return;
      const c = paletteOf(latest.current.dark);
      const data = buildData(latest.current);
      focus.current = data.focus;
      lastSig.current = JSON.stringify([data.resources, data.events, data.ranges, data.status]);
      const hostWidth = host.current.clientWidth || width;
      const compact = hostWidth < 520;
      const when = (iso: string) => new Date(iso).toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      scheduler.current = new Scheduler({
        appendTo: host.current,
        cls: "ayni-sched",
        autoHeight: true,
        // the axis starts where the data starts, not at the previous tick: no empty strip on the left
        timeAxis: { autoAdjust: false },
        // data refreshes every few seconds: bars must not fade in again each time
        useInitialAnimation: false,
        enableEventAnimations: false,
        rowHeight: 60,
        barMargin: 9,
        startDate: data.startDate,
        endDate: data.endDate,
        viewPreset: roundPreset({ windows: data.windows, gap: data.gap, hostWidth, locale: latest.current.locale, roundWord: latest.current.labels.round, dueWord: latest.current.labels.due, minRoundPx: 160 }),
        readOnly: true,
        columns: [memberColumn(latest.current.labels.member, memberColumnWidth(hostWidth), c, latest.current.labels.summary), ...(hostWidth >= 1180 ? [progressColumn(latest.current.labels.state.paid)] : [])],
        resources: data.resources,
        events: data.events,
        timeRanges: data.ranges,
        bbar: statusBar(data.status),
        tbar: chartToolbar(() => scheduler.current, latest.current.labels.toolbar, compact, () => focus.current),
        eventRenderer: ({ eventRecord: e }: any) => ({
          tag: "div",
          class: "ay-cell",
          children: e.isPot
            ? [
                { tag: "div", class: "ay-txt", children: [
                  { tag: "span", class: "ay-l", children: [{ tag: "i", class: "fa fa-hand-holding-dollar ay-ic" }, { tag: "span", class: "ay-word", text: `→ ${e.recipientFirst}` }] },
                  { tag: "span", class: "ay-amt", text: e.label },
                ] },
              ]
            : [
                { tag: "div", class: "ay-txt", children: [
                  { tag: "span", class: "ay-l", children: [{ tag: "i", class: `fa fa-${ICON[e.state as CellState]} ay-ic` }, { tag: "span", class: "ay-word", text: latest.current.labels.short[e.state as CellState] }] },
                  { tag: "span", class: "ay-amt", text: e.label },
                ] },
                ...(e.isRecipient ? [{ tag: "i", class: "fa fa-star ay-star" }] : []),
              ],
        }),
        features: {
          eventDrag: false,
          eventResize: false,
          eventEdit: false,
          eventDragCreate: false,
          eventMenu: false,
          scheduleMenu: false,
          timeAxisHeaderMenu: false,
          headerMenu: false,
          cellMenu: false,
          cellEdit: false,
          columnReorder: false,
          columnResize: false,
          scheduleTooltip: false,
          stripe: true,
          // the jump-to-bar buttons sit on top of the bars on a phone: only where there is room
          scrollButtons: hostWidth >= 900,
          pan: true,
          timeRanges: { showCurrentTimeLine: true, showHeaderElements: false, enableResizing: false, showTooltip: false },
          // the bottom row: what has been collected in each round, out of what is due
          summary: {
            summaries: [
              {
                label: latest.current.labels.summary,
                renderer: ({ startDate, endDate, events }: { startDate: Date; endDate: Date; events: any[] }) => {
                  const mid = (startDate.getTime() + endDate.getTime()) / 2;
                  let paid = 0;
                  let total = 0;
                  for (const e of events) {
                    if (e.startDate.getTime() <= mid && mid < e.endDate.getTime()) {
                      paid += e.paidCents;
                      total += e.totalCents;
                    }
                  }
                  const money = latest.current.money;
                  return `<span class="ay-sum${total > 0 && paid >= total ? " ay-full" : ""}"><b>${esc(money(paid))}</b><small>/ ${esc(money(total))}</small></span>`;
                },
              },
            ],
          },
          eventTooltip: {
            template: ({ eventRecord: e }: any) => {
              const l = latest.current.labels;
              if (e.isPot) {
                const money = latest.current.money;
                return tipHtml({
                  c: paletteOf(latest.current.dark),
                  avatarId: e.recipientUser,
                  name: e.recipientName,
                  chip: `${money(e.collected)} / ${money(e.total)}`,
                  hue: e.total > 0 && e.collected >= e.total ? "verde" : e.status === "UPCOMING" ? "muted" : "naranja",
                  lines: [`${esc(l.round)} ${e.round} · <b>${esc(e.label)}</b>`, `<small>${esc(l.receives)}</small>`, `<small>${esc(l.due)}: ${esc(when(e.endDate.toISOString()))}</small>`],
                });
              }
              const state = e.state as CellState;
              const r = e.resource;
              const lines = [`${esc(l.round)} ${e.round} · <b>${esc(e.label)}</b>`];
              lines.push(e.isRecipient ? `<b>★ ${esc(l.receives)}</b>` : `<small>${esc(l.receives)}: ${esc(e.recipientName)}</small>`);
              if (e.lateFeeCents > 0) lines.push(`<small>${esc(l.lateFee)}: ${esc(latest.current.money(e.lateFeeCents))}</small>`);
              lines.push(`<small>${e.paidAt ? `${esc(l.paidOn)}: ${esc(when(e.paidAt))}` : `${esc(l.due)}: ${esc(when(e.endDate.toISOString()))}`}</small>`);
              return tipHtml({ c: paletteOf(latest.current.dark), avatarId: r?.avatarId ?? "", name: r?.name ?? "", chip: l.state[state], hue: CELL_HUE[state], lines });
            },
          },
        },
      });
      setReady(true);
    })();
    return () => {
      disposed = true;
      scheduler.current?.destroy();
      scheduler.current = null;
    };
  }, [props.dark, widthBucket]);

  // New data from the server: the cells change without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    focus.current = data.focus;
    // nothing changed (the group is polled every few seconds): leave the chart alone
    const sig = JSON.stringify([data.resources, data.events, data.ranges, data.status]);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    // replacing the data resets the scroll: put it back where the person was looking
    const x = s.scrollX;
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
    s.timeRangeStore.data = data.ranges;
    setStatus(s, data.status);
    requestAnimationFrame(() => { if (scheduler.current === s) s.scrollX = x; });
  }, [props.rounds, props.members, props.myMembershipId, props.isOrganizer, props.now]);

  return createElement("div", null, ready ? null : createElement(Skeleton, { dark: props.dark }), createElement("div", { ref: host, style: HOST_STYLE }));
}
