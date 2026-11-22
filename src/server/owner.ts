import type { AppConfig } from './config';

export type Owner = { email: string };

export const DEV_OWNER_EMAIL = 'dev@local';

function norm(email: string): string {
  return email.trim().toLowerCase();
}

export function isOwnerEmail(candidate: string | null | undefined, ownerEmail: string | undefined): boolean {
  if (!candidate || !ownerEmail) return false;
  return norm(candidate) === norm(ownerEmail);
}

export async function resolveOwner(
  cfg: AppConfig,
  getSessionEmail: () => Promise<string | null>,
): Promise<Owner | null> {
  if (cfg.authMode === 'dev') return { email: DEV_OWNER_EMAIL };
  const email = await getSessionEmail();
  return email && isOwnerEmail(email, cfg.ownerEmail) ? { email: norm(email) } : null;
}

/** True when there is no Origin header, or its host equals the Host header. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  const host = req.headers.get('host') ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
