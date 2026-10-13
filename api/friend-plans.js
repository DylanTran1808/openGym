// gettingprime: friends' plans. Somebody who switched on S.sharePlan shows their plan — routines,
// week, unit and the custom exercises those routines use — to the other people on this server,
// read-only, and nothing else of theirs. The app turns it into a plan bundle (lib/plan-share.js
// buildPlanBundle → parsePlan, the same path a plan file takes), so the cleaning lives there once.

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** What a sharer shows: an allowlist, never a spread of the state. */
export function sharedPlan(S) {
  const routines = (Array.isArray(S?.routines) ? S.routines : []).filter(r => isObj(r) && r.id);
  const used = new Set(routines.flatMap(r => (Array.isArray(r.ex) ? r.ex : []).map(e => e?.id)));
  const customEx = (Array.isArray(S?.customEx) ? S.customEx : []).filter(c => isObj(c) && used.has(c.id));
  return { unit: S?.unit === 'lb' ? 'lb' : 'kg', week: isObj(S?.week) ? S.week : {}, routines, customEx };
}

/** When the plan last changed: the newest routine stamp, or null. */
export const planUpdated = S => {
  const ts = (Array.isArray(S?.routines) ? S.routines : []).map(r => Number(r?._ts) || 0);
  return Math.max(0, ...ts) || null;
};

// The push to the others when a sharer adds routines — without a flood while they set a plan up.
// Only a new routine with at least one exercise counts (edits, removals and empty shells don't),
// switching sharing on records the plan silently, and a sitting's routines go out as ONE push once
// the plan has been quiet for `quietMs`, at most one per `gapMs`, and only while the recipients are
// awake. `rec` is what db.json keeps per sharer: { ids seen, pending: { sig, last }, sentAt }.
export const PLAN_QUIET_MS = 15 * 60000;
export const PLAN_GAP_MS = 6 * 3600000;
const announced = S => (Array.isArray(S?.routines) ? S.routines : []).filter(r => isObj(r) && r.id && Array.isArray(r.ex) && r.ex.length);
// Any change to the plan's routines or their exercises starts the quiet period over.
const sigOf = rs => JSON.stringify(rs.map(r => [r.id, r.name, r.ex.map(e => e?.id)]));

/** { rec, send: names[] | null } for sharer state S at `now` (ms). rec null = not sharing. */
export function planPushStep(rec, S, now, { awake = true, quietMs = PLAN_QUIET_MS, gapMs = PLAN_GAP_MS } = {}) {
  if (S?.sharePlan !== true) return { rec: null, send: null };
  const rs = announced(S);
  const ids = rs.map(r => r.id);
  if (!Array.isArray(rec?.ids)) return { rec: { ids }, send: null };
  const sentAt = rec.sentAt ? { sentAt: rec.sentAt } : {};
  const added = rs.filter(r => !rec.ids.includes(r.id));
  if (!added.length) return { rec: { ids, ...sentAt }, send: null };
  const sig = sigOf(rs);
  const pending = rec.pending?.sig === sig ? rec.pending : { sig, last: now };
  const quiet = now - pending.last >= quietMs;
  const spaced = !rec.sentAt || now - rec.sentAt >= gapMs;
  if (quiet && spaced && awake) return { rec: { ids, sentAt: now }, send: added.map(r => String(r.name || 'Routine')) };
  return { rec: { ids: rec.ids, pending, ...sentAt }, send: null };
}
