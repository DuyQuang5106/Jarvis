import { serializeState, type WorkspaceState } from './context-builder';

const ID_KEYS = new Set(['id', 'areaId', 'milestoneId', 'documentId']);

/**
 * Replaces every entity UUID in `WorkspaceState` with a short deterministic session alias (`a1`, `d1`, `tp1`...)
 * before sending `<workspace_state>` to external AI proxies that scrub UUIDs into `00000000-...`.
 */
export function aliasWorkspaceState(state: WorkspaceState): {
  state: WorkspaceState;
  json: string;
  aliasToReal: Map<string, string>;
} {
  const realToAlias = new Map<string, string>();
  const aliasToReal = new Map<string, string>();
  const counters = new Map<string, number>();

  function alias(prefix: string, realId: string): string {
    const existing = realToAlias.get(realId);
    if (existing) return existing;
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    const short = `${prefix}${next}`;
    realToAlias.set(realId, short);
    aliasToReal.set(short, realId);
    return short;
  }

  const aliased: WorkspaceState = {
    ...state,
    areas: state.areas.map((a) => ({ ...a, id: alias('a', a.id) })),
    dueTasks: state.dueTasks.map((t) => ({ ...t, id: alias('t', t.id), areaId: alias('a', t.areaId) })),
    upcomingAssessments: state.upcomingAssessments.map((x) => ({
      ...x,
      id: alias('x', x.id),
      areaId: alias('a', x.areaId),
    })),
    staleAreaIds: state.staleAreaIds.map((id) => alias('a', id)),
    details: state.details.map((d) => ({
      ...d,
      areaId: alias('a', d.areaId),
      topics: d.topics.map((tp) => ({ ...tp, id: alias('tp', tp.id) })),
      assessments: d.assessments.map((x) => ({ ...x, id: alias('x', x.id) })),
      milestones: d.milestones.map((m) => ({ ...m, id: alias('m', m.id) })),
      blockers: d.blockers.map((b) => ({ ...b, id: alias('b', b.id) })),
      tasks: d.tasks.map((t) => ({
        ...t,
        id: alias('t', t.id),
        milestoneId: t.milestoneId ? alias('m', t.milestoneId) : null,
      })),
      notes: d.notes.map((n) => ({ ...n, id: alias('n', n.id) })),
    })),
    ...(state.documents
      ? {
          documents: state.documents.map((doc) => ({
            ...doc,
            documentId: alias('d', doc.documentId),
            areaId: alias('a', doc.areaId),
          })),
        }
      : {}),
  };

  return { state: aliased, json: serializeState(aliased), aliasToReal };
}

function mapIds(node: unknown, aliasToReal: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((item) => mapIds(item, aliasToReal));
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = ID_KEYS.has(k) && typeof v === 'string' ? (aliasToReal.get(v) ?? v) : mapIds(v, aliasToReal);
  }
  return out;
}

/** Resolves short aliases (`a1`, `d1`...) in raw model JSON back to real database UUIDs before Zod validation. */
export function resolveProposalAliases(rawJson: string, aliasToReal: Map<string, string>): string {
  if (aliasToReal.size === 0) return rawJson;
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    return JSON.stringify(mapIds(parsed, aliasToReal));
  } catch {
    return rawJson;
  }
}
