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
