import { ConfigError } from './errors';

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  dbDriver: 'postgres' | 'pglite';
  databaseUrl?: string;
  pgliteDir: string;
  authMode: 'supabase' | 'dev';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  ownerEmail?: string;
  aiProvider: 'fosta' | 'mock';
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiActionMode: 'tools' | 'json' | 'off';
  aiDailyRequestCap: number;
  /** Upper bound on serialized `<workspace_state>` characters per chat turn. */
  aiContextMaxChars: number;
  /** `maxOutputTokens` sent to the provider for a chat turn. */
  aiMaxOutputTokens: number;
  storageDriver: 'memory' | 'local' | 'supabase';
  storageDir: string;
  supabaseStorageBucket?: string;
  supabaseServiceRoleKey?: string;
  e2e: boolean;
};

type Env = Record<string, string | undefined>;

const DEFAULT_CONTEXT_MAX_CHARS = 120_000;
const MIN_CONTEXT_MAX_CHARS = 16_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const MIN_MAX_OUTPUT_TOKENS = 500;
const MAX_MAX_OUTPUT_TOKENS = 16_000;

function blank(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function pick<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = blank(env[name]);
  if (raw === undefined) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new ConfigError(`${name}=${raw} không hợp lệ; chỉ nhận: ${allowed.join(', ')}.`);
}

export function loadConfig(env: Env): AppConfig {
  const nodeEnv = pick(env, 'NODE_ENV', ['development', 'test', 'production'] as const, 'development');
  const prod = nodeEnv === 'production';

  const capRaw = blank(env.AI_DAILY_REQUEST_CAP);
  const cap = capRaw === undefined ? 200 : Number(capRaw);
  if (!Number.isInteger(cap) || cap < 0) {
    throw new ConfigError(`AI_DAILY_REQUEST_CAP=${capRaw} không hợp lệ; cần số nguyên không âm.`);
  }

  const contextRaw = blank(env.AI_CONTEXT_MAX_CHARS);
  const contextMax = contextRaw === undefined ? DEFAULT_CONTEXT_MAX_CHARS : Number(contextRaw);
  if (!Number.isInteger(contextMax) || contextMax < MIN_CONTEXT_MAX_CHARS) {
    throw new ConfigError(`AI_CONTEXT_MAX_CHARS=${contextRaw} không hợp lệ; cần số nguyên từ ${MIN_CONTEXT_MAX_CHARS} trở lên.`);
  }

  const outputRaw = blank(env.AI_MAX_OUTPUT_TOKENS);
  const maxOutput = outputRaw === undefined ? DEFAULT_MAX_OUTPUT_TOKENS : Number(outputRaw);
  if (!Number.isInteger(maxOutput) || maxOutput < MIN_MAX_OUTPUT_TOKENS || maxOutput > MAX_MAX_OUTPUT_TOKENS) {
    throw new ConfigError(
      `AI_MAX_OUTPUT_TOKENS=${outputRaw} không hợp lệ; cần số nguyên từ ${MIN_MAX_OUTPUT_TOKENS} đến ${MAX_MAX_OUTPUT_TOKENS}.`,
    );
  }

  const pgliteDir = blank(env.PGLITE_DIR) ?? './.pglite';
  const supabaseStorageBucket = blank(env.SUPABASE_STORAGE_BUCKET);
  const supabaseServiceRoleKey = blank(env.SUPABASE_SERVICE_ROLE_KEY);
  const defaultStorageDriver: AppConfig['storageDriver'] =
    pgliteDir === 'memory'
      ? 'memory'
      : supabaseStorageBucket && supabaseServiceRoleKey
        ? 'supabase'
        : 'local';

  return {
    nodeEnv,
    dbDriver: pick(env, 'DB_DRIVER', ['postgres', 'pglite'] as const, prod ? 'postgres' : 'pglite'),
    databaseUrl: blank(env.DATABASE_URL),
    pgliteDir,
    authMode: pick(env, 'AUTH_MODE', ['supabase', 'dev'] as const, prod ? 'supabase' : 'dev'),
    supabaseUrl: blank(env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: blank(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ownerEmail: blank(env.APP_OWNER_EMAIL),
    aiProvider: pick(env, 'AI_PROVIDER', ['fosta', 'mock'] as const, prod ? 'fosta' : 'mock'),
    aiBaseUrl: blank(env.AI_BASE_URL),
    aiApiKey: blank(env.AI_API_KEY),
    aiModel: blank(env.AI_MODEL),
    aiActionMode: pick(env, 'AI_ACTION_MODE', ['tools', 'json', 'off'] as const, 'off'),
    aiDailyRequestCap: cap,
    aiContextMaxChars: contextMax,
    aiMaxOutputTokens: maxOutput,
    storageDriver: pick(env, 'STORAGE_DRIVER', ['memory', 'local', 'supabase'] as const, defaultStorageDriver),
    storageDir: blank(env.STORAGE_DIR) ?? './.storage',
    supabaseStorageBucket,
    supabaseServiceRoleKey,
    e2e: env.E2E === '1',
  };
}

/** Throws one ConfigError listing every problem. Only enforced in production. */
export function assertSafeConfig(cfg: AppConfig): void {
  if (cfg.nodeEnv !== 'production') return;

  const problems: string[] = [];
  if (cfg.authMode === 'dev') problems.push('AUTH_MODE=dev bị cấm ở production (bỏ qua đăng nhập).');
  if (cfg.dbDriver === 'pglite') problems.push('DB_DRIVER=pglite bị cấm ở production.');
  if (cfg.storageDriver === 'memory') problems.push('STORAGE_DRIVER=memory bị cấm ở production.');
  if (cfg.e2e) problems.push('E2E=1 bị cấm ở production (mở route reset dữ liệu).');

  const missing: string[] = [];
  if (cfg.dbDriver === 'postgres' && !cfg.databaseUrl) missing.push('DATABASE_URL');
  if (cfg.authMode === 'supabase') {
    if (!cfg.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!cfg.supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (!cfg.ownerEmail) missing.push('APP_OWNER_EMAIL');
  }
  if (cfg.storageDriver === 'supabase') {
    if (!cfg.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!cfg.supabaseStorageBucket) missing.push('SUPABASE_STORAGE_BUCKET');
    if (!cfg.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  for (const name of missing) problems.push(`Thiếu biến môi trường bắt buộc: ${name}.`);

  if (problems.length > 0) {
    throw new ConfigError(`Cấu hình production không an toàn:\n- ${problems.join('\n- ')}`);
  }
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
