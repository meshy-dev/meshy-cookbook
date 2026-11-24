const buckets = new Map<string, number[]>()

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfter: number } {
  const times = (buckets.get(key) ?? []).filter((at) => now - at < windowMs)
  if (times.length >= limit) {
    const oldest = times[0] ?? now
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    buckets.set(key, times)
    return { ok: false, retryAfter }
  }
  times.push(now)
  buckets.set(key, times)
  return { ok: true }
}

function resetRateLimits() {
  buckets.clear()
}

export { clientIp, rateLimit, resetRateLimits }
