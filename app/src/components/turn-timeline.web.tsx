/**
 * Turn timeline (web): each row is a member, each bar is the round in which they receive the pot.
 * Built with Bryntum Scheduler. The organizer drags one member's bar onto another member's row to swap their turns.
 *
 * Safety: a drop never changes anything by itself. It asks for confirmation, sends the request to the server (which
 * checks the rules again) and then snaps the bar back; the bars move only when the server's data says so.
 * The date of each round never changes: a swap changes who receives it.
 */
import { createElement, useEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import type { TimelineProps, TimelineRound } from "./turn-timeline-types";

const ASSETS = "/bryntum";
const COLORS: Record<TimelineRound["status"], string> = { UPCOMING: "gray", COLLECTING: "orange", READY: "lime", PAID_OUT: "green" };

function loadCss(id: string, href: string): Promise<void> {
  return new Promise((resolve) => {
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") === href) return resolve();
    link.onload = () => resolve();
    link.onerror = () => resolve(); // a missing stylesheet must not leave the screen empty forever
    link.setAttribute("href", href);
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Data the scheduler shows, from the group's real rounds. Members without a turn yet are left out. */
function buildData(p: TimelineProps) {
  const rounds = [...p.rounds].sort((a, b) => a.number - b.number);
  const resources = [...p.members].filter((m) => m.turn != null).sort((a, b) => a.turn! - b.turn!).map((m) => ({ id: m.id, name: m.id === p.myMembershipId ? `${m.name} (${p.labels.mine})` : m.name, turn: m.turn }));
  const dueOf = (n: number) => new Date(rounds.find((r) => r.number === n)!.dueAt).getTime();
  const first = rounds[0] ? dueOf(rounds[0].number) : Date.now();
  const gap = rounds[1] ? dueOf(rounds[1].number) - first : 7 * 86_400_000;
  const events = rounds.map((r, i) => {
    const end = new Date(r.dueAt);
    const start = i === 0 ? (p.startsAt ? new Date(p.startsAt) : new Date(first - gap)) : new Date(rounds[i - 1].dueAt);
    const name = p.members.find((m) => m.id === r.recipientId)?.name ?? "";
    return {
      id: `r${r.number}`,
      resourceId: r.recipientId,
      startDate: start,
      endDate: end,
      name: `${p.labels.round} ${r.number}`,
      eventColor: COLORS[r.status],
      // Only the organizer, and only rounds that have not started, can be dragged.
      draggable: p.canEdit && r.status === "UPCOMING",
      resizable: false,
      status: r.status,
      recipient: name,
    };
  });
  const startDate = events[0] ? new Date(events[0].startDate.getTime() - (events[0].endDate.getTime() - events[0].startDate.getTime()) * 0.15) : new Date();
  const endDate = events.length ? new Date(events[events.length - 1].endDate.getTime() + gap * 0.15) : new Date(Date.now() + 86_400_000);
  return { resources, events, startDate, endDate };
}

/** The time scale that fits the whole pasanaku: minutes in demo mode, weeks or months in real life. */
function presetFor(startDate: Date, endDate: Date): string {
  const span = endDate.getTime() - startDate.getTime();
  const hour = 3600_000;
  if (span <= 6 * hour) return "minuteAndHour";
  if (span <= 4 * 24 * hour) return "hourAndDay";
  if (span <= 30 * 24 * hour) return "dayAndWeek";
  return "weekAndMonth";
}

export function TurnTimeline(props: TimelineProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const scheduler = useRef<any>(null);
  const latest = useRef(props);
  latest.current = props;
  const { width } = useWindowDimensions();

  // Create it once (and again if the organizer's rights or the color mode change).
  useEffect(() => {
    let disposed = false;
    (async () => {
      const el = host.current;
      if (!el) return;
      await Promise.all([
        loadCss("bryntum-core", `${ASSETS}/scheduler.css`),
        loadCss("bryntum-fa", `${ASSETS}/fontawesome/css/fontawesome.css`),
        loadCss("bryntum-fa-solid", `${ASSETS}/fontawesome/css/solid.css`),
      ]);
      await loadCss("bryntum-theme", `${ASSETS}/stockholm-${props.dark ? "dark" : "light"}.css`);
      // The key must be registered before the library loads. It is public by nature (it ships in the page).
      const key = process.env.EXPO_PUBLIC_BRYNTUM_LICENSE;
      if (key) ((globalThis as any).bryntum ??= {}).licenseKey = key;
      const { Scheduler } = await import("@bryntum/scheduler-enterprise");
      if (disposed || !host.current) return;

      const data = buildData(latest.current);
      const s = new Scheduler({
        appendTo: host.current,
        height: Math.max(220, 90 + data.resources.length * 52),
        rowHeight: 48,
        barMargin: 6,
        startDate: data.startDate,
        endDate: data.endDate,
        viewPreset: presetFor(data.startDate, data.endDate),
        readOnly: false,
        columns: [{ text: latest.current.labels.member, field: "name", width: 170 }],
        resources: data.resources,
        events: data.events,
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
          cellEdit: false,
          columnReorder: false,
          columnResize: false,
          timeRanges: { showCurrentTimeLine: true },
          eventTooltip: {
            template: ({ eventRecord }: any) =>
              `<b>${esc(eventRecord.name)}</b><br>${esc(eventRecord.recipient)}<br>${esc(latest.current.labels.status[eventRecord.status as TimelineRound["status"]])}<br>${esc(latest.current.labels.due)}: ${esc(
                eventRecord.endDate.toLocaleString(latest.current.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              )}`,
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
  }, [props.canEdit, props.dark]);

  // New data from the server: the bars move without reloading the page.
  useEffect(() => {
    const s = scheduler.current;
    if (!s) return;
    const data = buildData(props);
    s.resourceStore.data = data.resources;
    s.eventStore.data = data.events;
  }, [props.rounds, props.members, props.myMembershipId, props.canEdit]);

  // Keep the component as wide as the screen.
  useEffect(() => {
    scheduler.current?.refreshWithTransition?.();
  }, [width]);

  // Bryntum's theme sets no font: use the app's, so the timeline does not look like another product.
  return createElement("div", { ref: host, style: { width: "100%", fontFamily: "Figtree_400Regular, system-ui, sans-serif", fontSize: 15 } });
}
