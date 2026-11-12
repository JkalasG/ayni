/**
 * Turn timeline (web): each row is a member, each bar is the round in which they receive the pot, one COLUMN per round.
 * The members are in turn order, so the bars climb down the screen like a staircase and a dashed arrow carries the pot
 * from one turn to the next. A bar shows how far its round has got (contributions in, out of the group), the round in
 * progress is shaded. Built with Bryntum Scheduler.
 * The organizer drags one member's bar onto another member's row to swap their turns.
 *
 * Safety: a drop never changes anything by itself. It asks for confirmation, sends the request to the server (which
 * checks the rules again) and then snaps the bar back; the bars move only when the server's data says so.
 * The date of each round never changes: a swap changes who receives it.
 */
import { createElement, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { TimelineProps, TimelineRound } from "./turn-timeline-types";
import { ROUND_HUE } from "@/lib/sched-colors";
import { HOST_STYLE, chartToolbar, esc, loadScheduler, memberColumn, memberColumnWidth, paletteOf, roundPreset, roundWindows, setStatus, statusBar, tipHtml, type Texture } from "./bryntum-web";

const ICON: Record<TimelineRound["status"], string> = { UPCOMING: "hourglass-half", COLLECTING: "clock", READY: "hand-holding-dollar", PAID_OUT: "check" };
const TEXTURE: Record<TimelineRound["status"], Texture> = { UPCOMING: "hair", COLLECTING: "threads", READY: "twill", PAID_OUT: "twill" };

/** Data the scheduler shows, from the group's real rounds. Members without a turn yet are left out. */
function buildData(p: TimelineProps) {
  const { sorted, windows, gap, startDate, endDate } = roundWindows(p.rounds);
  const nameOf = (id: string) => p.members.find((m) => m.id === id)?.name ?? "";
  const resources = [...p.members]
    .filter((m) => m.turn != null)
    .sort((a, b) => a.turn! - b.turn!)
    .map((m) => {
      const me = m.id === p.myMembershipId;
      const turn = `${p.labels.turnWord} R${m.turn}`;
      return { id: m.id, name: m.name, avatarId: m.userId ?? m.id, isMe: me, sub: me ? `${p.labels.mine} · ${turn}` : turn };
    });
  const events = sorted.map((r) => {
    const w = windows.get(r.number)!;
    const total = r.total ?? 0;
    const paid = r.paid ?? 0;
    // Only the organizer, and only rounds that have not started, can be dragged.
    const draggable = p.canEdit && r.status === "UPCOMING";
    return {
      id: `r${r.number}`,
      resourceId: r.recipientId,
      startDate: w.start,
      endDate: w.end,
      name: `${p.labels.round} ${r.number} · ${p.labels.shortStatus[r.status]}`,
      cls: `ay-${ROUND_HUE[r.status]} ay-t-${TEXTURE[r.status]}${draggable ? " ay-drag" : ""}`,
      draggable,
      resizable: false,
      status: r.status,
      round: r.number,
      recipient: nameOf(r.recipientId),
      paid,
      total,
      count: total > 0 && r.status !== "UPCOMING" ? `${paid}/${total}` : "",
      // how far the round has got: the bar fills as contributions come in
      percentDone: r.status === "PAID_OUT" ? 100 : r.status === "UPCOMING" || !total ? 0 : Math.round((paid / total) * 100),
    };
  });
  // The pot passes from one turn to the next: an arrow from the end of a round to the start of the following one.
  const dependencies = sorted.slice(1).map((r, i) => ({ id: `d${r.number}`, from: `r${sorted[i].number}`, to: `r${r.number}`, type: 2 }));
  const current = sorted.find((r) => r.status === "COLLECTING") ?? sorted.find((r) => r.status === "READY");
  const cw = current ? windows.get(current.number)! : null;
  const ranges = cw ? [{ id: "current", name: "", startDate: cw.start, endDate: cw.end, cls: "ay-current-round" }] : [];
  const status = current ? `<b>${esc(p.labels.roundOf(current.number, sorted.length))}</b> · ${esc(current.recipientId ? nameOf(current.recipientId) : "")}` : "";
  return { resources, events, dependencies, ranges, windows, gap, startDate, endDate, status, focus: cw?.start ?? null };
}

export function TurnTimeline(props: TimelineProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const scheduler = useRef<any>(null);
  const focus = useRef<Date | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { width } = useWindowDimensions();
  // The scale is sized from the width, so it is built again when the window changes noticeably.
  const widthBucket = Math.round(width / 48);

  // Create it once (and again if the organizer's rights, the color mode or the width change).
  useEffect(() => {
    let disposed = false;
    (async () => {
      const el = host.current;
      if (!el) return;
      const Scheduler = await loadScheduler(props.dark);
      if (disposed || !host.current) return;

      const c = paletteOf(latest.current.dark);
      const data = buildData(latest.current);
      focus.current = data.focus;
      const hostWidth = host.current.clientWidth || width;
      const s = new Scheduler({
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
        readOnly: false,
        columns: [memberColumn(latest.current.labels.member, memberColumnWidth(hostWidth), c)],
        resources: data.resources,
        events: data.events,
        dependencies: data.dependencies,
        timeRanges: data.ranges,
        bbar: statusBar(data.status),
        tbar: chartToolbar(() => scheduler.current, latest.current.labels.toolbar, hostWidth < 520, () => focus.current),
        eventRenderer: ({ eventRecord: e }: any) => ({
          tag: "div",
          class: "ay-cell ay-turn",
          children: [
            { tag: "i", class: `fa fa-${ICON[e.status as TimelineRound["status"]]} ay-ic` },
            { tag: "span", class: "ay-amt", text: `${latest.current.labels.round} ${e.round}` },
            { tag: "span", class: "ay-word", text: latest.current.labels.shortStatus[e.status as TimelineRound["status"]] },
            ...(e.count ? [{ tag: "span", class: "ay-count", text: e.count }] : []),
          ],
        }),
        features: {
          eventDrag: props.canEdit
            ? {
                constrainDragToResource: false,
                // Valid only on ANOTHER member's row whose round has not started either.
                validatorFn: ({ eventRecords, newResource }: any) => {
                  const dragged = eventRecords?.[0];
                  if (!dragged || !newResource || newResource.id === dragged.resourceId) return false;
                  const target = s.eventStore.records.find((e: any) => e.resourceId === newResource.id);
                  const ok = !!target && target.status === "UPCOMING" && dragged.status === "UPCOMING";
                  return ok ? true : { valid: false, message: latest.current.labels.cannotSwap };
                },
              }
            : false,
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
          percentBar: { allowResize: false, showPercentage: false },
          dependencies: { allowCreate: false, showTooltip: false, radius: 8 },
          timeRanges: { showCurrentTimeLine: true, showHeaderElements: false, enableResizing: false, showTooltip: false },
          eventTooltip: {
            template: ({ eventRecord: e }: any) => {
              const l = latest.current.labels;
              const status = e.status as TimelineRound["status"];
              const lines = [`${esc(l.round)} ${e.round}`, `<small>${esc(l.due)}: ${esc(e.endDate.toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</small>`];
              if (e.count) lines.push(`<small>${esc(e.count)}</small>`);
              return tipHtml({ c: paletteOf(latest.current.dark), avatarId: e.resource?.avatarId ?? "", name: e.recipient, chip: l.status[status], hue: ROUND_HUE[status], lines });
            },
          },
        },
        listeners: {
          // Never apply the drop ourselves: ask, tell the server, then snap back. The data refresh moves the bars.
          beforeEventDropFinalize: ({ context }: any) => {
            context.async = true;
            const dragged = context.eventRecord;
            const target = context.newResource;
            (async () => {
              try {
                const a = latest.current.members.find((m) => m.id === dragged.resourceId)?.name ?? "";
                const b = latest.current.members.find((m) => m.id === target.id)?.name ?? "";
                if (window.confirm(latest.current.labels.confirm(a, b))) await latest.current.onSwap(dragged.resourceId, target.id);
              } catch {
                /* the screen shows the error; the bar snaps back either way */
              } finally {
                context.finalize(false);
              }
            })();
          },
        },
      });
      scheduler.current = s;
    })();
    return () => {
      disposed = true;
      scheduler.current?.destroy();
      scheduler.current = null;
    };
  }, [props.canEdit, props.dark, widthBucket]);

  // New data from the server: the bars move without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    focus.current = data.focus;
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
    s.dependencyStore.data = data.dependencies;
    s.timeRangeStore.data = data.ranges;
    setStatus(s, data.status);
  }, [props.rounds, props.members, props.myMembershipId, props.canEdit]);

  return createElement("div", { ref: host, style: HOST_STYLE });
}
