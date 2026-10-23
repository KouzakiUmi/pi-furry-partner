// Read-only compatibility adapter for DSH's observable Session bindings.
export function readDshSnapshot(store) {
  if (typeof store?.getSnapshot === 'function') return store.getSnapshot();
  if (typeof store?.getState === 'function') return store.getState();
}

export function selectDshSessionId(list, previous) {
  if (list?.activeId) return list.activeId; // Older DSH clients.
  const rows = Object.values(list?.byId || {});
  if (previous && (list?.byId?.[previous]?.retainedBy?.mainView || 0) > 0) return previous;
  return rows.find(row => (row?.retainedBy?.mainView || 0) > 0)?.id;
}

export function observeDshSessionBinding({ binding, sessionId, bridge, onChange = () => {} }) {
  let disposed = false, initialized = false, revision, durableCursor = -Infinity;
  const seenTransient = new WeakSet();
  const pushSession = () => {
    if (disposed) return;
    const state = readDshSnapshot(binding.session);
    if (!state) return;
    bridge.syncConversationState({ sessionId,
      ...(typeof state.running === 'boolean' ? { busy: state.running } : {}),
      ...(typeof state.status === 'string' ? { status: state.status } : {}),
    });
    onChange();
  };
  const dispatch = entry => {
    const event = entry?.event || entry;
    if (event && typeof event.type === 'string') bridge.handleSessionEvent({ ...event, sessionId });
  };
  const pushEvents = notification => {
    if (disposed) return;
    const window = readDshSnapshot(binding.eventSource);
    if (!Array.isArray(window?.entries)) {
      // Older emitters deliver a raw event instead of an invalidation.
      if (notification) { dispatch(notification); onChange(); }
      return;
    }
    if (initialized && window.revision !== undefined && window.revision === revision) return;
    let entries = window.entries;
    if (!initialized || window.change?.kind === 'replace') {
      const state = readDshSnapshot(binding.session);
      const running = state?.running ?? ['thinking', 'running', 'streaming', 'tool_calling', 'compacting'].includes(state?.status);
      const start = entries.findLastIndex(entry => (entry.event || entry)?.type === 'turn/start');
      // Do not replay an idle session's old completions, tools or prompts.
      if (running && start >= 0) entries = entries.slice(start);
      else {
        for (const entry of entries) {
          const event = entry.event || entry;
          if (entry.type === 'transient') seenTransient.add(entry);
          else if (Number.isFinite(event?.seq)) durableCursor = Math.max(durableCursor, event.seq);
        }
        entries = [];
      }
    } else if (window.change?.kind === 'prepend') entries = [];
    else if (window.change?.kind === 'append') entries = window.change.entries || entries;
    for (const entry of entries) {
      const event = entry?.event || entry;
      if (entry?.type === 'transient') {
        if (seenTransient.has(entry)) continue;
        seenTransient.add(entry);
      } else if (Number.isFinite(event?.seq)) {
        if (event.seq <= durableCursor) continue;
        durableCursor = event.seq;
      }
      dispatch(entry);
    }
    initialized = true; revision = window.revision;
    onChange();
  };
  pushSession();
  pushEvents();
  const sessionOff = binding.session?.subscribe?.(pushSession);
  const eventsOff = binding.eventSource?.subscribe?.(pushEvents);
  return () => {
    disposed = true;
    if (typeof sessionOff === 'function') sessionOff();
    if (typeof eventsOff === 'function') eventsOff();
  };
}

export function observeDshSessions({ sessions, bridge, onChange = () => {} }) {
  let id, binding, stopBinding, disposed = false;
  const clear = () => { stopBinding?.(); stopBinding = undefined; };
  const sync = () => {
    if (disposed) return;
    const nextId = selectDshSessionId(readDshSnapshot(sessions.list), id);
    let nextBinding;
    try { nextBinding = nextId && sessions.binding(nextId); } catch { /* Binding may materialize on the next publication. */ }
    if (nextId === id && nextBinding === binding) return;
    clear(); id = nextId; binding = nextBinding;
    if (!binding) { bridge.reset(); onChange(); return; }
    stopBinding = observeDshSessionBinding({ binding, sessionId: id, bridge, onChange });
    bridge.syncInputDraft('');
    onChange();
  };
  sync();
  const listOff = sessions.list?.subscribe?.(sync);
  return () => { disposed = true; clear(); if (typeof listOff === 'function') listOff(); };
}
