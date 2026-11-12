/**
 * Guarantee timeline (web): one row per member. A bar is the time a guarantee was kept (from the moment it was withheld
 * from their pot until it went back to their PayPal; still open if it has not), with the grey hatched stretch that
 * follows showing when it goes back. Diamonds mark what happened on the way: used to cover a contribution, used to close
 * an unpaid one, returned, refunded; each one carries its own label. Read-only.
 * Built with Bryntum Scheduler. Who sees which row is decided by the server: a member only gets their own.
 */
import { createElement, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { GuaranteeItem, GuaranteeKind, GuaranteeProps } from "./guarantee-timeline-types";
import { GUARANTEE_HUE } from "@/lib/sched-colors";
import { HOST_STYLE, chartToolbar, esc, loadScheduler, memberColumn, memberColumnWidth, paletteOf, schedulePreset, setStatus, statusBar, tipHtml } from "./bryntum-web";

function buildData(p: GuaranteeProps) {
  const resources = [...p.members]
    .sort((a, b) => (a.turn ?? 99) - (b.turn ?? 99))
    .map((m) => {
      const me = m.id === p.myMembershipId;
      const turn = m.turn != null ? `${p.labels.turnWord} R${m.turn}` : "";
      return { id: m.id, name: m.name, avatarId: m.userId ?? m.id, isMe: me, sub: me ? [p.labels.mine, turn].filter(Boolean).join(" · ") : turn, held: p.money(m.heldCents) };
    });
  const times = p.items.flatMap((i) => [new Date(i.at).getTime(), i.until ? new Date(i.until).getTime() : 0]).filter(Boolean);
  const first = Math.min(...(p.startsAt ? [new Date(p.startsAt).getTime()] : []), ...times, p.now);
  const last = Math.max(...(p.endsAt ? [new Date(p.endsAt).getTime()] : []), ...times, p.now);
  const pad = Math.max((last - first) * 0.04, 60_000);
  const events = p.items.flatMap((i: GuaranteeItem) => {
    const start = new Date(i.at);
    const open = i.kind === "HELD" && !i.until;
    const bar = i.kind === "HELD";
    // A guarantee that is still held is drawn up to "now" and keeps growing.
    const end = bar ? new Date(Math.max(i.until ? new Date(i.until).getTime() : p.now, start.getTime() + 60_000)) : start;
    const money = p.money(i.amountCents);
    const failed = i.status === "FAILED";
    // Still held: the rest of the pasanaku is shown hatched, "it goes back when the group ends and you have paid everything".
    const later =
      open && p.endsAt && new Date(p.endsAt).getTime() > end.getTime()
        ? [{ id: `${i.id}:later`, resourceId: i.membershipId, startDate: end, endDate: new Date(p.endsAt), name: p.labels.back, cls: "ay-muted ay-dashed", draggable: false, resizable: false, kind: "LATER", round: null, amountCents: i.amountCents, open: false, label: "", failed: false }]
        : [];
    return [
      {
        id: i.id,
        resourceId: i.membershipId,
        startDate: start,
        endDate: end,
        // amount first: on a narrow bar that is the part that must stay visible
        name: `${money} · ${p.labels.kind[i.kind]}${open ? ` · ${p.labels.stillHeld}` : failed ? ` · ${p.labels.failed}` : ""}`,
        cls: failed ? `ay-muted${bar ? " ay-t-dots" : ""}` : `ay-${GUARANTEE_HUE[i.kind]}${bar ? " ay-t-twill" : ""}`,
        draggable: false,
        resizable: false,
        kind: i.kind,
        round: i.round,
        amountCents: i.amountCents,
        open,
        failed,
        money,
        // diamonds (things that happened on a day) are named beside the diamond; bars carry their own text
        // (the leading non-breaking spaces keep the text clear of the diamond: Bryntum places it from the diamond centre)
        label: bar ? "" : `${" ".repeat(9)}${money} · ${p.labels.kind[i.kind]}${failed ? ` · ${p.labels.failed}` : ""}`,
      },
      ...later,
    ];
  });
  const firstHeld = p.items.filter((i) => i.kind === "HELD").map((i) => new Date(i.at).getTime()).sort((a, b) => a - b)[0];
  // One fifth of the span stands in for the width of a round (a pasanaku has at least a handful).
  const status = `${esc(p.labels.held)}: <b>${esc(p.money(p.members.reduce((s, m) => s + m.heldCents, 0)))}</b>`;
  return { resources, events, status, startDate: new Date(first - pad), endDate: new Date(last + pad), roundMs: Math.max((last - first) / 5, 60_000), focus: firstHeld ? new Date(firstHeld - 3_600_000) : null };
}

export function GuaranteeTimeline(props: GuaranteeProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const scheduler = useRef<any>(null);
  const focus = useRef<Date | null>(null);
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
      const hostWidth = host.current.clientWidth || width;
      const when = (d: Date) => d.toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
        viewPreset: schedulePreset({ startDate: data.startDate, endDate: data.endDate, roundMs: data.roundMs, hostWidth, locale: latest.current.locale, minRoundPx: 190 }),
        readOnly: true,
        columns: [
          memberColumn(latest.current.labels.member, memberColumnWidth(hostWidth), c),
          ...(hostWidth >= 720
            ? [{ text: latest.current.labels.held, field: "held", width: 110, htmlEncode: false, sortable: false, renderer: ({ record }: any) => `<b>${esc(record.held)}</b>` }]
            : []),
        ],
        resources: data.resources,
        events: data.events,
        bbar: statusBar(data.status),
        tbar: chartToolbar(() => scheduler.current, latest.current.labels.toolbar, hostWidth < 520, () => focus.current),
        eventRenderer: ({ eventRecord: e }: any) =>
          e.kind === "LATER"
            ? { tag: "div", class: "ay-cell", children: [{ tag: "span", class: "ay-word", text: e.name }] }
            : e.kind === "HELD"
              ? {
                  tag: "div",
                  class: "ay-cell",
                  children: [
                    { tag: "i", class: "fa fa-shield-halved ay-ic" },
                    { tag: "span", class: "ay-amt", text: e.money },
                    { tag: "span", class: "ay-word", text: e.open ? latest.current.labels.stillHeld : latest.current.labels.kind.HELD },
                  ],
                }
              : "",
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
          scrollButtons: hostWidth >= 520,
          pan: true,
          labels: { after: { field: "label" } },
          timeRanges: { showCurrentTimeLine: true, showHeaderElements: false, enableResizing: false, showTooltip: false },
          eventTooltip: {
            template: ({ eventRecord: e }: any) => {
              const l = latest.current.labels;
              if (e.kind === "LATER") return `<div class="ay-tip"><b>${esc(l.back)}</b></div>`;
              const kind = e.kind as GuaranteeKind;
              const lines = [`<b>${esc(latest.current.money(e.amountCents))}</b>`];
              if (e.round != null) lines.push(`<small>${esc(l.round)} ${e.round}</small>`);
              lines.push(`<small>${kind === "HELD" ? (e.open ? esc(l.stillHeld) : `${esc(l.until)}: ${esc(when(e.endDate))}`) : esc(when(e.startDate))}</small>`);
              return tipHtml({ c: paletteOf(latest.current.dark), avatarId: e.resource?.avatarId ?? "", name: e.resource?.name ?? "", chip: l.kind[kind], hue: GUARANTEE_HUE[kind], lines });
            },
          },
        },
      });
      // On a narrow screen the first bar may start beyond the edge: bring it into view.
      if (data.focus) {
        try {
          scheduler.current.scrollToDate(data.focus, { block: "start", animate: false });
        } catch {
          /* the chart is still usable without it */
        }
      }
    })();
    return () => {
      disposed = true;
      scheduler.current?.destroy();
      scheduler.current = null;
    };
  }, [props.dark, widthBucket]);

  // New data from the server: the bars grow or close without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    focus.current = data.focus;
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
    s.setTimeSpan(data.startDate, data.endDate);
    setStatus(s, data.status);
  }, [props.items, props.members, props.myMembershipId, props.now]);

  return createElement("div", { ref: host, style: HOST_STYLE });
}
