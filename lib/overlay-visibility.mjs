// Observe only public overlay handles. Images below or beside a modal remain
// visible; a stripe touching the modal is suppressed before its DCS is emitted.
const observersByOwner = new WeakMap();

function observeMethod(owner, descriptor, observer) {
  let entry = observersByOwner.get(owner);
  if (!entry || Object.getOwnPropertyDescriptor(owner, "showOverlay")?.value !== entry.wrapped) {
    entry = { descriptor, observers: new Set(), wrapped: undefined };
    entry.wrapped = function (...args) {
      for (const listener of entry.observers) listener.before(this);
      const handle = entry.descriptor.value.apply(this, args);
      for (const listener of entry.observers) listener.after(this, handle);
      return handle;
    };
    Object.defineProperty(owner, "showOverlay", { ...descriptor, value: entry.wrapped });
    observersByOwner.set(owner, entry);
  }
  entry.observers.add(observer);
  return () => {
    entry.observers.delete(observer);
    if (entry.observers.size) return;
    if (Object.getOwnPropertyDescriptor(owner, "showOverlay")?.value === entry.wrapped) {
      Object.defineProperty(owner, "showOverlay", entry.descriptor);
    }
    if (observersByOwner.get(owner) === entry) observersByOwner.delete(owner);
  };
}

export function createOverlayVisibility(tui) {
  // Pi passes a stable Proxy whose function getters create a fresh forwarding
  // closure each time, and whose setters target only the current renderer.
  // Observe the public method on its real owner so renderer replacements are
  // covered, and compare descriptors rather than Proxy-returned functions.
  let owner = tui, descriptor;
  while (owner) {
    descriptor = Object.getOwnPropertyDescriptor(owner, "showOverlay");
    if (typeof descriptor?.value === "function") break;
    owner = Object.getPrototypeOf(owner);
  }
  const original = descriptor?.value;
  const terminal = tui.terminal;
  const handles = new Set();
  let unknown = Boolean(tui.hasOverlay?.());
  let disposed = false;
  const ours = (renderer) => !disposed && (terminal ? renderer?.terminal === terminal : renderer === tui);
  const unsubscribe = typeof original === "function" ? observeMethod(owner, descriptor, {
    before(renderer) {
      if (ours(renderer) && !tui.hasOverlay()) { handles.clear(); unknown = false; }
    },
    after(renderer, handle) {
      if (!ours(renderer)) return;
      if (handles.size >= 64) unknown = true;
      else handles.add(handle);
    },
  }) : undefined;
  return {
    allows(rect) {
      if (disposed) return false;
      if (!tui.hasOverlay()) { handles.clear(); unknown = false; return true; }
      // At marker collection time the final terminal-relative row is unknown.
      if (!rect) return true;
      if (unknown || !unsubscribe) return false;
      let known = false;
      for (const handle of handles) {
        const bounds = handle.getBounds?.();
        if (!bounds) continue;
        known = true;
        if (rect.row < bounds.row + bounds.height && rect.row + rect.height > bounds.row &&
            rect.column < bounds.col + bounds.width && rect.column + rect.width > bounds.col) return false;
      }
      return known;
    },
    dispose() {
      if (disposed) return;
      disposed = true; handles.clear();
      unsubscribe?.();
    },
  };
}
