// Independent product and integration suites; no model requests are made.
await import("../scripts/verify-pi-line.mjs");
await import("./main-action-isolation.mjs");
await import("./hd-adapter.mjs");
await import("./activity.mjs");
await import("./activity-state-gap.mjs");
await import("./response-latency.mjs");
await import("./footer.mjs");
await import("./dock-layout.mjs");
await import("./quick-actions.mjs");
await import("./sixel.mjs");
await import("./kitty.mjs");
await import("./header-timeline.mjs");
await import("./motion.mjs");
await import("./ordinary-simple-motion.mjs");
await import("./style-ids.mjs");
await import("./startup-eyelids.mjs");
await import("./poke.mjs");
await import("./watch.mjs");
await import("./listen.mjs");
await import("./search.mjs");
await import("./integration.mjs");
await import("./streaming-layout.mjs");
await import("./overlay-visibility.mjs");
await import("./regular-overlay.mjs");
await import("./mouse-routing.mjs");
await import("./native-prompt.mjs");
await import("./command-chinese.mjs");
await import("./mascot-autocomplete.mjs");
await import("./ui-chinese.mjs");
await import("./language-integration.mjs");
await import("./prompt-ordering.mjs");
await import("./language.mjs");
await import("./build-editions.mjs");

const { FULL_ANIMATION_EDITION } = await import('../lib/build-profile.mjs');
if (FULL_ANIMATION_EDITION) {
  for (const name of ['approved-motion', 'approved-motion-pi', 'approved-motion-poke', 'approved-motion-pack',
    'approved-motion-codec', 'approved-motion-binary-pack', 'approved-color-derivative',
    'approved-motion-timing', 'state-motion-routing-pi', 'approved-auxiliary-route', 'approved-idle-variants', 'approved-nod', 'approved-idle-wave', 'approved-stretch', 'approved-peek', 'approved-head-shake', 'approved-ear-flick', 'approved-bounce', 'approved-nuzzle', 'approved-motion-viewport', 'approved-action-dwell', 'action-dwell-pi', 'approved-tool-gap', 'tool-gap-pi', ]) await import(`./${name}.mjs`);
}

await import("./tool-error-activity.mjs");
await import("./tool-error-pi.mjs");

await import("./native-interactions.mjs");
await import("./native-interactions-pi.mjs");
