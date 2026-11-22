import { assertSafeConfig, getConfig } from './server/config';

/** Node-only startup check, loaded from instrumentation.ts so the Edge bundle never sees `process.exit`. */
export function assertSafeConfigOrExit(): void {
  try {
    assertSafeConfig(getConfig());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    // Next only logs errors thrown from register() and keeps serving 500s; stop the process outright.
    process.exit(1);
  }
}
