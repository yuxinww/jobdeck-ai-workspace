import { CoachError, publicError } from "./errors";
import { runCoach } from "./coach";
import { isAllowedOrigin } from "./origin";

export const MAX_REQUEST_BYTES = 256 * 1024;

export async function readWebJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new CoachError("INVALID_CONTENT_TYPE", "请发送 application/json。", 415);
  const length = request.headers.get("content-length"); if (length && Number(length) > MAX_REQUEST_BYTES) throw new CoachError("PAYLOAD_TOO_LARGE", "材料过大。", 413);
  const reader = request.body?.getReader(); if (!reader) throw new CoachError("INVALID_INPUT", "请求体为空。");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new CoachError("PAYLOAD_TOO_LARGE", "材料过大。", 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new CoachError("INVALID_JSON", "请求不是合法 JSON。"); }
}

export function errorResponse(error: unknown) { return Response.json({ status: "error", error: publicError(error) }, { status: error instanceof CoachError ? error.httpStatus : 500, headers: { "Cache-Control": "no-store" } }); }

export async function handleCoachRequest(request: Request) {
  try { if (!isAllowedOrigin(request)) throw new CoachError("ORIGIN_FORBIDDEN", "拒绝跨站请求。", 403); const input = await readWebJson(request); return Response.json(await runCoach(input, { signal: request.signal }), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
