import { ProposedActionSchema, ProposeChangesSchema, type ProposeChanges } from './schema';

export const PROPOSAL_OPEN = '<proposed_actions>';
export const PROPOSAL_CLOSE = '</proposed_actions>';

function longestPrefixSuffix(buf: string, target: string): number {
  const max = Math.min(buf.length, target.length - 1);
  for (let len = max; len > 0; len -= 1) {
    if (buf.endsWith(target.slice(0, len))) return len;
  }
  return 0;
}

export class ProposalBlockFilter {
  private mode: 'text' | 'block' | 'done' = 'text';
  private buf = '';
  private raw = '';

  push(delta: string): string {
    if (!delta || this.mode === 'done') return '';
    if (this.mode === 'block') {
      this.raw += delta;
      const closeIdx = this.raw.indexOf(PROPOSAL_CLOSE);
      if (closeIdx >= 0) {
        this.raw = this.raw.slice(0, closeIdx);
        this.mode = 'done';
      }
      return '';
    }

    this.buf += delta;
    const openIdx = this.buf.indexOf(PROPOSAL_OPEN);
    if (openIdx >= 0) {
      const visible = this.buf.slice(0, openIdx);
      const rest = this.buf.slice(openIdx + PROPOSAL_OPEN.length);
      this.buf = '';
      const closeIdx = rest.indexOf(PROPOSAL_CLOSE);
      if (closeIdx >= 0) {
        this.raw = rest.slice(0, closeIdx);
        this.mode = 'done';
      } else {
        this.raw = rest;
        this.mode = 'block';
      }
      return visible;
    }

    const keep = longestPrefixSuffix(this.buf, PROPOSAL_OPEN);
    if (keep === 0) {
      const visible = this.buf;
      this.buf = '';
      return visible;
    }
    const visible = this.buf.slice(0, this.buf.length - keep);
    this.buf = this.buf.slice(this.buf.length - keep);
    return visible;
  }

  end(): { visibleTail: string; rawJson: string | null } {
    if (this.mode === 'text') {
      const visibleTail = this.buf;
      this.buf = '';
      return { visibleTail, rawJson: null };
    }
    return { visibleTail: '', rawJson: this.raw };
  }
}

/**
 * A failed parse says why (`parse`: not JSON, `schema`: wrong shape) and which fields, never their values.
 * Actions that fail the schema are left out when at least one other action is valid; `skipped` counts them.
 */
export type ParseProposalResult =
  | { ok: true; value: ProposeChanges; skipped: number }
  | { ok: false; reason: 'parse' | 'schema'; issues: string[] };

export function parseProposal(raw: string): ParseProposalResult {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: 'parse', issues: [] };
  }
  const parsed = ProposeChangesSchema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data, skipped: 0 };
  const issues = parsed.error.issues.map((i) => i.path.map(String).join('.'));
  // One malformed action should not cost the owner the valid ones: retry with only the actions that parse.
  const actions = (json as { actions?: unknown } | null)?.actions;
  if (Array.isArray(actions)) {
    const valid = actions.filter((a) => ProposedActionSchema.safeParse(a).success);
    if (valid.length > 0 && valid.length < actions.length) {
      const retry = ProposeChangesSchema.safeParse({ ...(json as object), actions: valid });
      if (retry.success) return { ok: true, value: retry.data, skipped: actions.length - valid.length };
    }
  }
  return { ok: false, reason: 'schema', issues };
}
