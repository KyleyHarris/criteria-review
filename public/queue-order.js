// The order a review queue is worked in.
//
// SHARED BY THE PAGE AND THE COMMAND LINE, deliberately. A conversational review walks
// the same queue the browser shows, and two implementations of "most important first"
// would disagree the moment either was touched - so the reviewer would be told
// different things by the two surfaces and could not tell which was right.
//
// Lives under public/ because that is what both can import: the page loads it over
// HTTP, and node reads it off disk.

/**
 * Lifecycle order. Anything not listed is an unknown status, which sorts as MOST
 * urgent rather than being silently treated as fine: a status the tool cannot rank
 * must not be ranked safe.
 */
export const STATUS_ORDER = { null: 0, proposed: 1, derived: 2, verified: 3, accepted: 4 };

/** A working session's deliberate interrupt. */
export const flagged = (s) => (s.flags || []).includes('looknow');

/** The architect has written something an agent must act on. */
export const needsAgent = (s) => (s.flags || []).includes('review');

/**
 * How well sourced a scenario's intent is.
 *
 * An intent counts as sourced only if it CITES something. Prose that merely discusses
 * intent is unsourced on purpose, because criteria built from observed behaviour
 * produce tests that can never disagree with the software.
 */
export function intentClass(intent) {
  if (!intent) return 'missing';
  const t = String(intent);
  const citesSomething =
    /\.(md|cs|ts|js|txt|pdf)\b/i.test(t) || /https?:\/\//i.test(t) || /#\d+/.test(t);
  return citesSomething ? 'sourced' : 'unsourced';
}

/** Lower is more urgent: an unconfirmed status first, then an unsourced intent. */
export function scenarioRisk(s) {
  const status = STATUS_ORDER[s.status] ?? 0;
  const cls = intentClass(s.intent);
  const intent = cls === 'missing' ? 0 : cls === 'unsourced' ? 1 : 2;
  return status * 10 + intent;
}

/**
 * Order a queue: grouped by document, documents ranked by their worst scenario, and
 * anything flagged pulled to the front.
 *
 * Grouping optimises a steady review pass - reading six scenarios from one document
 * costs far less context than six from six. A `@looknow` outranks the grouping because
 * it means a session found something and wants eyes on it before the pass arrives.
 */
export function orderQueue(items) {
  const docs = new Map();
  for (const s of items) {
    const key = `${s.project}|${s.source}`;
    if (!docs.has(key)) docs.set(key, []);
    docs.get(key).push(s);
  }

  const ranked = [...docs.entries()].map(([key, list]) => ({
    key,
    list: [...list].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    // A document is as urgent as its worst scenario, then by how much unreviewed work
    // it holds, so the big blind spots come before the near-finished ones.
    worst: Math.min(...list.map(scenarioRisk)),
    outstanding: list.length,
  }));

  ranked.sort(
    (a, b) => a.worst - b.worst || b.outstanding - a.outstanding || a.key.localeCompare(b.key)
  );

  const ordered = ranked.flatMap((d) => d.list);
  return [...ordered.filter(flagged), ...ordered.filter((s) => !flagged(s))];
}
