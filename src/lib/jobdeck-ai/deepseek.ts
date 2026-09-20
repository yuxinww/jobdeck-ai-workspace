import { CoachError } from "./errors";

export interface DeepSeekConfig { apiKey: string; baseURL: string; model: string; thinking: "enabled" | "disabled"; effort: "low" | "high" | "max"; maxTokens: number; timeoutMs: number; }

function integerSetting(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  const numberValue = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) throw new CoachError("CONFIG_INVALID", `${name} 配置无效。`, 503);
  return numberValue;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  if ((env.AI_MODE || "live") !== "live") throw new CoachError("CONFIG_INVALID", "该运行入口仅支持 live；Mock 仅存在于离线测试。", 503);
  const apiKey = (env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey || /YOUR_|replace|填写|placeholder/i.test(apiKey)) throw new CoachError("CONFIG_REQUIRED", "请在服务端 .env.local 配置 DEEPSEEK_API_KEY。", 503);
  const baseURL = (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  if (baseURL !== "https://api.deepseek.com") throw new CoachError("CONFIG_INVALID", "本版只允许 DeepSeek 官方 API 域名。", 503);
  const model = env.DEEPSEEK_MODEL || "deepseek-flash";
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) throw new CoachError("CONFIG_INVALID", "DEEPSEEK_MODEL 格式无效。", 503);
  const thinking = env.DEEPSEEK_THINKING || "disabled";
  const effort = env.DEEPSEEK_REASONING_EFFORT || "high";
  if (!(["enabled", "disabled"] as string[]).includes(thinking) || !(["low", "high", "max"] as string[]).includes(effort)) throw new CoachError("CONFIG_INVALID", "思考模式配置无效。", 503);
  return { apiKey, baseURL, model, thinking: thinking as DeepSeekConfig["thinking"], effort: effort as DeepSeekConfig["effort"], maxTokens: integerSetting(env.DEEPSEEK_MAX_TOKENS, 8192, 256, 32768, "DEEPSEEK_MAX_TOKENS"), timeoutMs: integerSetting(env.DEEPSEEK_TIMEOUT_MS, 90000, 1000, 180000, "DEEPSEEK_TIMEOUT_MS") };
}

function upstreamError(status: number) {
  const mapped: Record<number, [string, string, number]> = { 400: ["UPSTREAM_BAD_REQUEST", "DeepSeek 拒绝了请求格式；请检查参数。", 502], 401: ["UPSTREAM_AUTH_FAILED", "DeepSeek API Key 无效或无权限。", 503], 402: ["UPSTREAM_BALANCE_REQUIRED", "DeepSeek 账户余额不足。", 503], 404: ["UPSTREAM_NOT_FOUND", "模型或接口不存在；请检查模型列表与配置。", 502], 422: ["UPSTREAM_PARAMETERS_INVALID", "DeepSeek 请求参数不合法。", 502], 429: ["UPSTREAM_RATE_LIMIT", "DeepSeek 请求受限，请稍后手动重试。", 429], 500: ["UPSTREAM_ERROR", "DeepSeek 服务异常，请稍后手动重试。", 502], 503: ["UPSTREAM_BUSY", "DeepSeek 服务繁忙，请稍后手动重试。", 503] };
  const [code, message, httpStatus] = mapped[status] || ["UPSTREAM_ERROR", "模型服务请求失败。", 502];
  return new CoachError(code, message, httpStatus, { upstreamStatus: status });
}

async function readLimitedJson(response: Response) {
  if (!response.body) throw new CoachError("UPSTREAM_EMPTY", "模型服务未返回响应体。", 502);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new CoachError("UPSTREAM_TOO_LARGE", "模型响应超出本应用限制。", 502); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; } catch { throw new CoachError("UPSTREAM_INVALID_JSON", "模型服务响应不是完整 JSON。", 502); }
}

async function request(config: DeepSeekConfig, body: Record<string, unknown>, signal?: AbortSignal) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, { method: "POST", redirect: "error", cache: "no-store", signal: requestSignal, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); throw upstreamError(response.status); }
    return await readLimitedJson(response);
  } catch (error) {
    if (error instanceof CoachError) throw error;
    if (signal?.aborted) throw new CoachError("REQUEST_CANCELLED", "请求已取消。", 499);
    if (controller.signal.aborted) throw new CoachError("UPSTREAM_TIMEOUT", "模型调用超时；请稍后手动重试。", 504);
    throw new CoachError("UPSTREAM_NETWORK", "无法连接 DeepSeek；请检查服务器网络。", 502);
  } finally { clearTimeout(timer); }
}

export async function completeJson(config: DeepSeekConfig, messages: { role: "system" | "user" | "assistant"; content: string }[], signal?: AbortSignal) {
  const body: Record<string, unknown> = { model: config.model, messages, stream: false, thinking: { type: config.thinking }, max_tokens: config.maxTokens, response_format: { type: "json_object" }, ...(config.thinking === "enabled" ? { reasoning_effort: config.effort } : { temperature: 0.2 }) };
  const raw = await request(config, body, signal); const choices = Array.isArray(raw.choices) ? raw.choices : []; const choice = choices[0] as Record<string, unknown> | undefined;
  if (choice?.finish_reason === "length") throw new CoachError("OUTPUT_TRUNCATED", "模型输出被截断；请缩短材料或调整输出上限后重试。", 502);
  if (choice?.finish_reason === "content_filter") throw new CoachError("UPSTREAM_FILTERED", "模型服务未提供该内容。", 502);
  const message = choice?.message as Record<string, unknown> | undefined;
  if (!choice || choice.finish_reason !== "stop" || typeof message?.content !== "string" || !message.content.trim()) throw new CoachError("OUTPUT_EMPTY", "模型未返回完整可用内容。", 502);
  let result: unknown; try { result = JSON.parse(message.content); } catch { throw new CoachError("OUTPUT_INVALID_JSON", "AI 返回内容无法解析为 JSON；没有切换为 Mock。", 502); }
  if (!result || Array.isArray(result) || typeof result !== "object") throw new CoachError("OUTPUT_INVALID_JSON", "AI 需要返回 JSON 对象。", 502);
  const rawUsage = raw.usage; const usage = rawUsage && typeof rawUsage === "object" ? Object.fromEntries(Object.entries(rawUsage).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) : null;
  return { result, completionId: typeof raw.id === "string" ? raw.id : null, actualModel: typeof raw.model === "string" ? raw.model : null, usage, finishReason: String(choice.finish_reason) };
}
