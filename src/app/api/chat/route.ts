import { runChat } from "@/lib/jobdeck-ai/chat";
import { errorResponse, readWebJson } from "@/lib/jobdeck-ai/http";
import { isAllowedOrigin } from "@/lib/jobdeck-ai/origin";
import { CoachError } from "@/lib/jobdeck-ai/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isAllowedOrigin(request)) throw new CoachError("ORIGIN_FORBIDDEN", "拒绝跨站请求。", 403);
    const body = await readWebJson(request);
    return Response.json(await runChat(body, { signal: request.signal }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
