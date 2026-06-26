const CACHE_TTL_MS = 30_000;
const normalizeAccount = (account) => (account || "").toLowerCase();
const cacheKey = (account) => `taskchain-cache:${normalizeAccount(account)}`;

export function readCachedTasks(account) {
  const key = cacheKey(account);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.timestamp || !Array.isArray(parsed.tasks)) return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed.tasks;
  } catch {
    return null;
  }
}

export function writeCachedTasks(account, tasks) {
  const key = cacheKey(account);
  localStorage.setItem(
    key,
    JSON.stringify({
      tasks,
      timestamp: Date.now()
    })
  );
}

export function clearCachedTasks(account) {
  localStorage.removeItem(cacheKey(account));
}
