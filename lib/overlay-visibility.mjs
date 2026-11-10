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
  const seen = new WeakSet();
  // True when an overlay may exist that this guard cannot name. hasOverlay()
  // going false does not prove it was destroyed: setHidden(false) and Pi's
  // visible() option both restore an overlay without showOverlay.
  let unknown = Boolean(tui.hasOverlay?.());
  let disposed = false;
  let visibilityKey = "", visibilityVersion = 0;
  const ours = (renderer) => !disposed && (terminal ? renderer?.terminal === terminal : renderer === tui);
  const track = (handle) => {
    if (!handle || typeof handle !== "object") { unknown = true; return; }
    if (!seen.has(handle)) {
      seen.add(handle);
      const hide = handle.hide;
      if (typeof hide === "function") {
        try {
          handle.hide = function (...args) {
            const result = hide.apply(this, args);
            handles.delete(handle);
            return result;
          };
        } catch { /* A non-writable hide cannot be observed; missing bounds stay fail-closed. */ }
      }
    }
    if (handles.has(handle)) return;
    if (handles.size >= 64) { unknown = true; return; }
    handles.add(handle);
  };
  const unsubscribe = typeof original === "function" ? observeMethod(owner, descriptor, {
    before() {
      // A later showOverlay is not evidence that a hidden, size-gated, or
      // untracked overlay is gone. hide() is the only removal proof.
    },
    after(renderer, handle) {
      if (ours(renderer)) track(handle);
    },
  }) : undefined;
  const version = () => {
    const active = Boolean(tui.hasOverlay?.());
    const bounds = active ? [...handles].map((handle) => {
      const value = handle.isHidden?.() ? undefined : handle.getBounds?.();
      return value ? `${value.row},${value.col},${value.width},${value.height}` : "?";
    }).join("|") : "";
    const next = `${active ? 1 : 0}:${unknown ? 1 : 0}:${bounds}`;
    if (next !== visibilityKey) { visibilityKey = next; visibilityVersion++; }
    return visibilityVersion;
  };
  return {
    version,
    allows(rect) {
      if (disposed) return false;
      if (!tui.hasOverlay()) { version(); return true; }
      // At marker collection time the final terminal-relative row is unknown.
      if (!rect) return true;
      if (unknown || !unsubscribe) return false;
      let known = false;
      for (const handle of handles) {
        if (handle.isHidden?.()) continue;
        const bounds = handle.getBounds?.();
        // No bounds yet: not composited, size-gated by visible(), or removed
        // without hide(). Keep the handle. Another handle with bounds can
        // still prove this rect is clear; if none can, fail closed below.
        if (!bounds) continue;
        known = true;
        if (rect.row < bounds.row + bounds.height && rect.row + rect.height > bounds.row &&
            rect.column < bounds.col + bounds.width && rect.column + rect.width > bounds.col) return false;
      }
      return known;
    },
    dispose() {
      if (disposed) return;
      disposed = true; handles.clear(); visibilityVersion++;
      unsubscribe?.();
    },
  };
}
