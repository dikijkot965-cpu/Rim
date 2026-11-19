/**
 * Pure send-policy rules: rate limits and burst protection for messengers.
 * No timers here — caller supplies timestamps.
 */

/** Minimum gap between two successful text sends in the same conversation (ms). */
export const MIN_SEND_INTERVAL_MS = 350;

/** Max text sends per rolling window per conversation. */
export const SEND_BURST_LIMIT = 12;
export const SEND_BURST_WINDOW_MS = 10_000;

/**
 * @param {number[]} recentTimestampsMs - recent send times (oldest→newest or any order)
 * @param {number} nowMs
 * @param {{ minIntervalMs?: number, burstLimit?: number, burstWindowMs?: number }} [policy]
 * @returns {{ ok: true } | { ok: false, error: string, retryAfterMs?: number }}
 */
export function evaluateSendAllowed(recentTimestampsMs, nowMs, policy = {}) {
  const minInterval = policy.minIntervalMs ?? MIN_SEND_INTERVAL_MS;
  const burstLimit = policy.burstLimit ?? SEND_BURST_LIMIT;
  const burstWindow = policy.burstWindowMs ?? SEND_BURST_WINDOW_MS;
  const now = Number(nowMs) || Date.now();
  const times = (recentTimestampsMs || [])
    .map(t => Number(t))
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length) {
    const last = times[times.length - 1];
    const delta = now - last;
    if (delta >= 0 && delta < minInterval) {
      return {
        ok: false,
        error: 'Слишком быстро. Подождите мгновение перед следующей отправкой.',
        retryAfterMs: minInterval - delta
      };
    }
  }

  const windowStart = now - burstWindow;
  const inWindow = times.filter(t => t >= windowStart);
  if (inWindow.length >= burstLimit) {
    const oldestInWindow = inWindow[0];
    const retryAfterMs = Math.max(0, burstWindow - (now - oldestInWindow));
    return {
      ok: false,
      error: 'Слишком много сообщений подряд. Небольшая пауза — и снова в строй.',
      retryAfterMs
    };
  }

  return { ok: true };
}

/**
 * Append a send timestamp and drop entries outside the burst window.
 * @param {number[]} recentTimestampsMs
 * @param {number} nowMs
 * @param {number} [burstWindowMs]
 * @returns {number[]}
 */
export function recordSendTimestamp(recentTimestampsMs, nowMs, burstWindowMs = SEND_BURST_WINDOW_MS) {
  const now = Number(nowMs) || Date.now();
  const windowStart = now - burstWindowMs;
  const next = (recentTimestampsMs || [])
    .map(t => Number(t))
    .filter(t => Number.isFinite(t) && t >= windowStart);
  next.push(now);
  return next;
}
