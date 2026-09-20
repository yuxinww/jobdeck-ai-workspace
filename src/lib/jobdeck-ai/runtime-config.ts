type RuntimeGlobal = typeof globalThis & { __JOBDECK_RUNTIME_API_KEY__?: string | null };
const runtimeGlobal = globalThis as RuntimeGlobal;
let legacyRuntimeApiKey: string | null = null;

function currentRuntimeApiKey() {
  if (!runtimeGlobal.__JOBDECK_RUNTIME_API_KEY__ && legacyRuntimeApiKey) runtimeGlobal.__JOBDECK_RUNTIME_API_KEY__ = legacyRuntimeApiKey;
  return runtimeGlobal.__JOBDECK_RUNTIME_API_KEY__ ?? null;
}

export function configureRuntimeApiKey(value: string) {
  const apiKey = value.trim();
  if (!apiKey || apiKey.length > 400 || /YOUR_|replace|填写|placeholder/i.test(apiKey)) return false;
  legacyRuntimeApiKey = apiKey;
  runtimeGlobal.__JOBDECK_RUNTIME_API_KEY__ = apiKey;
  return true;
}

export function clearRuntimeApiKey() {
  legacyRuntimeApiKey = null;
  runtimeGlobal.__JOBDECK_RUNTIME_API_KEY__ = null;
}

export function runtimeConfigStatus(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = currentRuntimeApiKey();
  return { configured: Boolean(apiKey || (env.DEEPSEEK_API_KEY || "").trim()), model: env.DEEPSEEK_MODEL || "deepseek-flash", source: apiKey ? "runtime" : env.DEEPSEEK_API_KEY ? "environment" : "none" } as const;
}

export function serverEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const apiKey = currentRuntimeApiKey();
  return apiKey ? { ...env, DEEPSEEK_API_KEY: apiKey } : env;
}
