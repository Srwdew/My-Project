// Who is online right now: the last authenticated request per user, kept in memory.
// The notification bell polls every 60s while a tab is visible, so 2 minutes covers one missed poll.
// shortcut: per-process memory, resets on restart and is not shared between instances; move to Redis/DB if the backend scales out.
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const lastSeen = new Map<string, number>();

export function markSeen(userId: string, now = Date.now()) {
  lastSeen.set(userId, now);
}
export function onlineUserIds(now = Date.now()) {
  const ids: string[] = [];
  for (const [id, at] of lastSeen)
    if (now - at <= ONLINE_WINDOW_MS) ids.push(id);
    else lastSeen.delete(id);
  return ids;
}
