export type EntityLink = { kind: 'task' | 'milestone'; id: string };

const TASK_LINK_RE = /^task:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MILESTONE_LINK_RE = /^milestone:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseEntityLink(href: string | undefined): EntityLink | null {
  if (!href) return null;
  const t = TASK_LINK_RE.exec(href.trim());
  if (t) return { kind: 'task', id: t[1] };
  const m = MILESTONE_LINK_RE.exec(href.trim());
  if (m) return { kind: 'milestone', id: m[1] };
  return null;
}

export function formatEntityMarkdownLink(kind: 'task' | 'milestone', id: string, title: string): string {
  const safeTitle = title.replace(/[\[\]]/g, '\\$&');
  return `[${safeTitle}](${kind}:${id})`;
}
