// Fixed display calibration, distinct from creative character animation.
// Coordinates are in the authored 640px reference space. No per-frame bounds
// or auto-fit: foreshortening and actual filmed movement remain inside the clip.
export const PET_PAINT_INSETS = Object.freeze({ left: .30, top: .35, right: .15, bottom: .10 });
export const PET_ANIMATED_PAINT_INSETS = Object.freeze({ left: .30, top: .35, right: .21, bottom: .41 });
export const PET_DISPLAY_TRANSITION_MS = 220;
export const PET_DISPLAY_PROFILES = Object.freeze({
  ordinary: Object.freeze({ id: 'ordinary', scale: 1, sourceAnchor: [320, 602], targetAnchor: [320, 602] }),
  watch: Object.freeze({ id: 'watch', scale: 1, sourceAnchor: [338, 604], targetAnchor: [320, 602] }),
  search: Object.freeze({ id: 'search', scale: 1.30, sourceAnchor: [360, 580], targetAnchor: [320, 602] }),
});
export function presentationProfile(style, frameId = '', layerKey = '', registered = false) {
  // The approved bank and its replacement videos already share one canonical
  // scale/support baseline. Applying the old 1.30 search calibration again
  // would enlarge and move a correctly registered asset.
  // Blink/mouth sources must never change the whole character's display scale.
  if (registered) return PET_DISPLAY_PROFILES.ordinary;
  if (!['umi', 'umi-pixel'].includes(style)) return PET_DISPLAY_PROFILES.ordinary;
  const actualId = layerKey ? layerKey.replace(/^poses\//, '') : frameId;
  if (/^search(?:-|$)/.test(actualId)) return PET_DISPLAY_PROFILES.search;
  if (/^watch(?:-|$)/.test(actualId)) return PET_DISPLAY_PROFILES.watch;
  return PET_DISPLAY_PROFILES.ordinary;
}
export function presentationMatrix(profile = PET_DISPLAY_PROFILES.ordinary) {
  const scale = profile.scale;
  return { scale, x: profile.targetAnchor[0] - profile.sourceAnchor[0] * scale,
    y: profile.targetAnchor[1] - profile.sourceAnchor[1] * scale };
}
export function createPresentationPlayer({ durationMs = PET_DISPLAY_TRANSITION_MS } = {}) {
  let active = null, startedAt = 0, lastStyle = null, opacityFrom = 1;
  function opacityAt(time) {
    const t = Math.max(0, Math.min(1, (time - startedAt) / durationMs));
    const e = t * t * (3 - 2 * t);
    return opacityFrom + (1 - opacityFrom) * e;
  }
  return {
    sample(style, profile, time, animate = true) {
      const key = `${style}/${profile.transitionGroup || profile.id}`;
      if (active !== key) {
        const previousOpacity = opacityAt(time);
        // Apply the new asset's correct scale immediately. Interpolating the
        // previous 1.30 search scale onto a normal frame would make it balloon.
        opacityFrom = !active || lastStyle !== style || !animate ? 1 : previousOpacity < 1 ? previousOpacity : .84;
        startedAt = time; active = key; lastStyle = style;
      }
      if (!animate) opacityFrom = 1;
      const opacity = opacityAt(time);
      return { ...presentationMatrix(profile), profile: profile.id, opacity,
        transitioning: animate && time - startedAt < durationMs && opacity < 1 };
    },
    transitioning(time) { return Boolean(active && opacityFrom < 1 && time - startedAt < durationMs); },
    reset() { active = lastStyle = null; opacityFrom = 1; },
  };
}
export function petPaintGeometry(size, expanded = true, animated = false) {
  const i = expanded ? animated ? PET_ANIMATED_PAINT_INSETS : PET_PAINT_INSETS : { left: 0, top: 0, right: 0, bottom: 0 };
  return { width: size * (1 + i.left + i.right), height: size * (1 + i.top + i.bottom),
    left: -size * i.left, top: -size * i.top, insetX: i.left, insetY: i.top,
    widthRatio: 1 + i.left + i.right, heightRatio: 1 + i.top + i.bottom };
}
export function floatingPetGeometry(requestedSize, viewport, ui = {}, expanded = true, animated = false) {
  const inset = expanded ? animated ? PET_ANIMATED_PAINT_INSETS : PET_PAINT_INSETS : { left: 0, top: 0, right: 0, bottom: 0 };
  const widthRatio = 1 + inset.left + inset.right, heightRatio = 1 + inset.top + inset.bottom;
  const fit = Math.max(1, Math.min((viewport.w - 16) / widthRatio, (viewport.h - 16) / heightRatio));
  const size = ui.minimized ? 44 : Math.min(requestedSize, Math.max(1, Math.floor(fit)));
  const i = ui.minimized ? { left: 0, top: 0, right: 0, bottom: 0 } : inset;
  const minLeft = 8 + i.left * size, maxLeft = viewport.w - 8 - (1 + i.right) * size;
  const minTop = 8 + i.top * size, maxTop = viewport.h - 8 - (1 + i.bottom) * size;
  return { size, left: Math.max(minLeft, Math.min(maxLeft, (ui.xRatio ?? .9) * (viewport.w - size))),
    top: Math.max(minTop, Math.min(maxTop, (ui.yRatio ?? .76) * (viewport.h - size))) };
}
