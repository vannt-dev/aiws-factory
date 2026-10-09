const DOUBLE_CLICK_WINDOW_MS = 500;

/** Creates a guard that rejects a click on a key arriving less than 500 ms after the last accepted click on that key. */
export function createDoubleClickGuard() {
  const lastAcceptedAt = new Map();
  return (key, at) => {
    const last = lastAcceptedAt.get(key);
    if (last !== undefined && at - last < DOUBLE_CLICK_WINDOW_MS) return false;
    lastAcceptedAt.set(key, at);
    return true;
  };
}
