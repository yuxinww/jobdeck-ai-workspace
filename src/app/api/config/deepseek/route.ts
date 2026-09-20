import { configureRuntimeApiKey, clearRuntimeApiKey, runtimeConfigStatus } from "@/lib/jobdeck-ai/runtime-config";
import { isAllowedOrigin } from "@/lib/jobdeck-ai/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return Response.json({ error: { code: "ORIGIN_FORBIDDEN", message: "拒绝跨站请求。" } }, { status: 403 });
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: { code: "INVALID_INPUT", message: "请求格式不正确。" } }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (input.operation === "status") return Response.json({ configured: runtimeConfigStatus().configured, model: runtimeConfigStatus().model }, { headers: { "Cache-Control": "no-store" } });
    if (input.operation === "clear") { clearRuntimeApiKey(); return Response.json({ configured: runtimeConfigStatus().configured, model: runtimeConfigStatus().model }, { headers: { "Cache-Control": "no-store" } }); }
    if (typeof input.apiKey !== "string") return Response.json({ error: { code: "INVALID_INPUT", message: "请填写 DeepSeek API Key。" } }, { status: 400 });
    if (!configureRuntimeApiKey(input.apiKey)) return Response.json({ error: { code: "INVALID_INPUT", message: "API Key 不能为空或格式不正确。" } }, { status: 400 });
    const status = runtimeConfigStatus();
    return Response.json({ configured: status.configured, model: status.model }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: { code: "INVALID_JSON", message: "请求不是合法 JSON。" } }, { status: 400 });
  }
}
