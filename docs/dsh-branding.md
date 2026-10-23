# DSH title image and floating pet

DSH's blank-session brand mark uses its own routed image at the existing title
location. It never mirrors the floating pet's working, search, sleepy or other
expressions. The title is an ordinary `<img>`, not a dynamic canvas, and creates
no activity subscription, poke handler or JavaScript animation timer. Its optional
slot registration follows settings-only notifications, never animation ticks.

`assets/branding/umi-title.png` is the exact user-provided transparent PNG,
1254×1254 RGBA. It is copied without resampling or re-encoding. SHA-256:
`1f8b4a57fcfa360bdc869a41eec4015b0b7546838c3f4f7d1dce33fb4e046221`.

An independently reviewed waving loop may be supplied as
`umi-title-wave.webp` or `umi-title-wave.gif`, alongside `title.json`:

```json
{
  "schemaVersion": 1,
  "animation": {
    "file": "umi-title-wave.webp",
    "sha256": "the-complete-file-sha256",
    "qa": { "accepted": true }
  }
}
```

The host route `/api/furry-partner/branding/title` serves that animation only
when the fixed filename allowlist, explicit acceptance, SHA-256 and multi-frame
format checks all pass. Otherwise it serves the original PNG. The
`?variant=static` form always serves the PNG; unsupported variants return 404.
The route never accepts a filesystem path. It uses a real image response with
a content type, ETag and revalidation, with no embedded base64 asset. A browser
image-load failure gets one static retry. Reduced-motion preference selects the
static image directly. The native browser plays a valid title animation on its
own; agent state and the desktop pet's motion clock do not drive it.

The former “我在呢” / “I'm here” composer chip has been removed completely:
there is no input-row slot registration, placeholder, obsolete switch or hidden
input-row React component. Old `composerPill` preferences cannot bring it back.
The floating pet retains its independent interactive canvas, menus and state
animations. Typing/listening remains a read-only subscription to the public
DSH `conversation.input.for(binding.ctx).state` store, with session-switch and
lifecycle cleanup. It does not mutate, submit, persist or log draft text.

The `heroMark` setting still controls whether DSH's native title brand is replaced.
Disabling the floating pet leaves the title image available without retaining a
pet animation timer. Pi's terminal layout is unchanged.

Checks: `tests/dsh-branding.mjs`, `tests/dsh-title-ui.mjs`,
`tests/dsh-input-observer.mjs`, and the DSH host/client integration suites.
