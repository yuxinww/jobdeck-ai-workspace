function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" || hostname === "0.0.0.0";
}

export function isAllowedOrigin(request: Request) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return true;
  if (rawOrigin === "null") return process.env.NODE_ENV !== "production" && isLoopback(new URL(request.url).hostname);
  try {
    const origin = new URL(rawOrigin); const target = new URL(request.url);
    if (origin.origin === target.origin) return true;
    // Local development commonly alternates between localhost and 127.0.0.1.
    return isLoopback(origin.hostname) && isLoopback(target.hostname) && origin.port === target.port;
  } catch {
    return false;
  }
}
