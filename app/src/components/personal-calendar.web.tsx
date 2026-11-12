/**
 * The person's money calendar (web): what they pay and what they receive in ALL their pasanakus, day by day. Built with
 * Bryntum Calendar. Each day shows its movements and, in the month view, the net of the day; clicking a day tells the
 * screen which date the side summary talks about.
 */
import { createElement, useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { byDay, dayKey, fromKey, signed, type CalData, type CalEvent } from "@/lib/personal-calendar";
import type { PersonalCalendarProps } from "./personal-calendar-types";
import { HOST_STYLE, esc, paletteOf } from "./bryntum-web";
import { loadCalendar } from "./bryntum-calendar";

const ICON: Record<string, string> = { pay: "arrow-up-right-from-square", receive: "hand-holding-dollar", return: "shield-halved" };
const STATE_ICON: Record<string, string> = { paid: "check", covered: "shield-halved", pending: "clock", late: "triangle-exclamation", unpaid: "ban", received: "check", sending: "paper-plane", failed: "triangle-exclamation", upcoming: "hourglass-half" };

/** One look per kind of movement and state: the same colors as everywhere else in Ayni. */
export function hueOfEvent(e: CalEvent): "verde" | "naranja" | "rojo" | "turquesa" | "amarillo" | "muted" {
  if (e.kind === "receive") return e.status === "failed" ? "rojo" : "amarillo";
  if (e.kind === "return") return "turquesa";
  if (e.status === "paid") return "verde";
  if (e.status === "covered") return "turquesa";
  if (e.status === "late" || e.status === "unpaid") return "rojo";
  if (e.status === "pending") return "naranja";
  return "muted";
}

const GROUP_COLORS = (dark: boolean) => paletteOf(dark).threads as unknown as string[];

function toBryntum(data: CalData, p: PersonalCalendarProps) {
  const colors = GROUP_COLORS(p.dark);
  const resources = data.groups.map((g, i) => ({ id: g.id, name: g.name, color: colors[i % colors.length] }));
  const events = data.events.map((e) => {
    const day = fromKey(dayKey(e.at));
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const sign = signed(e) < 0 ? "−" : e.kind === "pay" ? "−" : "+";
    return {
      id: e.id,
      name: `${sign}${p.money(e.amountCents)} · ${e.groupName}`,
      startDate: day,
      endDate: next,
      allDay: true,
      resourceId: e.groupId,
      groupId: e.groupId,
      draggable: false,
      resizable: false,
      cls: `ay-ev ay-h-${hueOfEvent(e)} ay-k-${e.kind}${e.estimated ? " ay-est" : ""}`,
      kind: e.kind,
      status: e.status,
      estimated: e.estimated,
      amountCents: e.amountCents,
      heldCents: e.heldCents ?? 0,
      round: e.round,
      groupName: e.groupName,
      sign,
      dueAt: e.dueAt,
    };
  });
  return { resources, events };
}

let latest_open: (groupId: string) => void = () => {};

export function PersonalCalendar(props: PersonalCalendarProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const calendar = useRef<any>(null);
  const latest = useRef(props);
  latest.current = props;
  latest_open = (id) => latest.current.onOpenGroup(id);
  const { width } = useWindowDimensions();
  const [ready, setReady] = useState(false);
  const bucket = Math.round(width / 96);
  const lastSig = useRef("");

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!host.current) return;
      const Calendar = await loadCalendar(props.dark, props.lang);
      if (disposed || !host.current) return;
      const p = latest.current;
      const { resources, events } = toBryntum(p.data, p);
      lastSig.current = JSON.stringify([p.data.events, p.lang]);
      const totals = () => byDay(latest.current.data.events);
      const compact = (host.current.clientWidth || width) < 520;
      // a month cell is narrow: icon and amount only (the pasanaku is in the tooltip and in the day summary);
      // the week and the agenda have room for its name too
      const draw = (withGroup: boolean) => ({ eventRecord: e, renderData }: any) => {
        renderData.solidBar = false;
        renderData.showBullet = false;
        return {
          tag: "div",
          class: "ay-evc",
          children: [
            { tag: "i", class: `fa fa-${ICON[e.kind]} ay-evi` },
            { tag: "b", class: "ay-eva", text: `${e.sign}${latest.current.money(e.amountCents)}${e.estimated ? " ~" : ""}` },
            ...(withGroup ? [{ tag: "span", class: "ay-evg", text: e.groupName }] : []),
          ],
        };
      };
      calendar.current = new Calendar({
        appendTo: host.current,
        cls: "ayni-cal",
        height: compact ? 640 : 720,
        date: p.selected,
        mode: compact ? "agenda" : "month",
        // the person only reads their money: nothing is created, dragged or edited here
        readOnly: true,
        resources,
        events,
        // every view draws the movements the same way
        modes: { day: null, year: null, week: compact ? null : { eventRenderer: draw(true) }, month: { eventRenderer: draw(false) }, agenda: { eventRenderer: draw(true) } },
        sidebar: false,
        features: {
          drag: false,
          // the card that opens on a movement: the movement and its pasanaku, in Ayni's own look
          eventTooltip: { renderer: ({ eventRecord: e }: any) => card(e, latest.current), titleRenderer: () => "", tooltip: { cls: "ay-evtip", tools: { edit: false } } },
        },
        listeners: {
          activeDateChange: ({ value }: any) => value && latest.current.onSelect(value),
          eventClick: ({ date, eventRecord }: any) => latest.current.onSelect(date ?? eventRecord.startDate),
        },
      });
      // a click on an empty stretch of a day also picks that day
      host.current.addEventListener("click", (ev) => {
        const cell = (ev.target as HTMLElement).closest?.("[data-date]") as HTMLElement | null;
        const iso = cell?.dataset.date;
        if (iso) latest.current.onSelect(fromKey(iso.slice(0, 10)));
      });
      void totals;
      setReady(true);
    })().catch((e) => console.error("personal calendar failed", e));
    return () => {
      disposed = true;
      calendar.current?.destroy();
      calendar.current = null;
      setReady(false);
    };
  }, [props.dark, props.lang, bucket]);

  // the screen picked another day (a jump button): the calendar goes there too
  useEffect(() => {
    const c = calendar.current;
    if (!c || !ready) return;
    const now = c.date as Date | undefined;
    if (!now || dayKey(now) !== dayKey(props.selected)) c.date = props.selected;
  }, [props.selected, ready]);

  // new data from the server: the events change without rebuilding the calendar
  useEffect(() => {
    const c = calendar.current;
    if (!c) return;
    const sig = JSON.stringify([props.data.events, props.lang]);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const { resources, events } = toBryntum(props.data, props);
    c.resourceStore.data = resources;
    c.eventStore.data = events;
  }, [props.data]);

  const c = paletteOf(props.dark);
  const bar = (w: string, h: number) => createElement("div", { style: { width: w, height: h, background: c.line, opacity: 0.55, animation: "ay-pulse 1.2s ease-in-out infinite" } });
  // while the engine loads: the shape of a month, so the page does not jump
  const skeleton = createElement(
    "div",
    { "aria-busy": "true", style: { position: "absolute", inset: 0, border: `2px solid ${c.line}`, background: c.surface, padding: 12, display: "flex", flexDirection: "column", gap: 10 } },
    createElement("style", null, "@keyframes ay-pulse { 0%,100% { opacity: .35 } 50% { opacity: .7 } }"),
    createElement("div", { style: { display: "flex", gap: 10 } }, bar("90px", 36), bar("40px", 36), bar("180px", 36)),
    ...[0, 1, 2, 3, 4].map((i) => createElement("div", { key: i, style: { display: "flex", gap: 6, flex: 1 } }, ...[0, 1, 2, 3, 4, 5, 6].map((k) => createElement("div", { key: k, style: { flex: 1, border: `1px solid ${c.line}` } }))))
  );
  return createElement(
    "div",
    { style: { position: "relative", minHeight: 720 } },
    ready ? null : skeleton,
    createElement("div", { ref: host, style: { ...HOST_STYLE, visibility: ready ? "visible" : "hidden" } })
  );
}

/** The card of a movement: what it is, how much, and the pasanaku behind it with where it stands. */
function card(e: any, p: PersonalCalendarProps) {
  const l = p.labels;
  const g = p.data.groups.find((x) => x.id === e.groupId);
  const hue = hueOfEvent({ kind: e.kind, status: e.status } as CalEvent);
  const kind = e.kind === "pay" ? l.pay : e.kind === "receive" ? l.receive : l.guarantee;
  const day = (iso: string) => new Date(iso).toLocaleDateString(p.lang === "en" ? "en-US" : "es-BO", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (x) => x.toUpperCase());
  const row = (label: string, value: string, strong = false) => ({ class: "ay-tip-row", children: [{ tag: "span", text: label }, { tag: strong ? "b" : "span", text: value }] });
  const done = e.status === "paid" || e.status === "covered" || e.status === "received";
  const rows = [
    ...(e.round && g ? [row(l.round, `${e.round} / ${g.rounds}`)] : []),
    row(l.status, `${l.state[e.status] ?? e.status}${e.estimated ? ` · ${l.estimated}` : ""}`, true),
    row(done ? l.paidOn : l.due, day(e.startDate.toISOString())),
    ...(e.kind === "receive" ? [row(l.pot, p.money(e.amountCents + (e.heldCents ?? 0))), row(l.held, "−" + p.money(e.heldCents ?? 0)), row(l.youGet, p.money(e.amountCents), true)] : []),
  ];
  return {
    class: "ay-tip",
    children: [
      { class: `ay-tip-head ay-h-${hue}`, children: [{ tag: "i", class: `fa fa-${ICON[e.kind]}` }, { tag: "b", text: `${e.sign}${p.money(e.amountCents)}` }, { tag: "span", text: kind }] },
      {
        class: "ay-tip-group",
        children: [
          { tag: "b", text: e.groupName },
          ...(g
            ? [
                { tag: "span", text: `${l.groupState[g.status] ?? g.status} · ${l.freq[g.frequency] ?? g.frequency} · ${g.members} ${l.members} · ${p.money(g.contributionCents)}` },
                ...(g.rounds > 0 ? [{ class: "ay-tip-bar", children: [{ tag: "i", style: `width:${Math.round((g.paidOutRounds / g.rounds) * 100)}%` }] }, { tag: "span", class: "ay-tip-sub", text: `${l.progress}: ${g.paidOutRounds} / ${g.rounds}${g.myTurn ? ` · ${l.turn} ${g.myTurn}` : ""}` }] : []),
              ]
            : []),
        ],
      },
      { class: "ay-tip-rows", children: rows },
      { tag: "button", class: "ay-tip-open", text: l.open, listeners: { click: () => latest_open(e.groupId) } },
    ],
  };
}
