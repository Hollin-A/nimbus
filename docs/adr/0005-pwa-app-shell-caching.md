# 0005 — PWA app-shell caching

**Status:** Accepted
**Date:** 2026-05-25

## Context

Nimbus ships as a Progressive Web App so users can install it on desktop or
mobile from a single codebase. The brief allows "web or mobile"; building a
PWA addresses both with one bundle.

The headline question for any PWA is: what does the service worker cache,
and what does it always fetch?

Two cache categories matter:

1. **App shell** — HTML, CSS, JS, fonts, icons. Changes only on deploy.
2. **Live data** — weather, real-time messages. Changes constantly.

## Decision

**Precache the app shell. Never cache live data.**

- vite-plugin-pwa's `generateSW` strategy with default Workbox precaching
  covers HTML, CSS, JS, fonts and icons emitted by the build.
- `runtimeCaching: []` explicitly — no opportunistic caching of any request.
- `registerType: 'autoUpdate'` so a deployed update is fetched, installed and
  activated transparently on the next page load. No "click here to update"
  banner.
- The weather API (`/api/weather*`) and the WebSocket (`socket.io`) always
  hit the network. When the network is unavailable, the UI shows an
  `OfflineNotice` banner and disables those actions explicitly (lands with
  the offline-polish commit later).

## Consequences

**Positive**

- Installs cleanly to desktop and mobile; opens instantly on cold start
  because the shell is precached.
- New deploys propagate within one navigation — reviewers see the latest UI
  without "refresh and clear cache" dance.
- No stale-data foot guns. A weather card showing 5-hour-old conditions, or
  a popup with yesterday's "alert", would be a worse experience than a
  clearly offline state.

**Negative / mitigated**

- The app does not work offline beyond rendering the shell. That is the
  intended scope — weather and alerts are useless when stale. The offline
  banner makes the limitation explicit instead of failing silently.
- Service workers can be a debugging nuisance during development. `autoUpdate`
  replaces the previous version quickly, but reviewers iterating in DevTools
  should know a SW is registered. Noted in the README's local-dev section.

## Icons

SVG used for both 192 px and 512 px icon entries plus the maskable variant.
One file scales cleanly to every required size, and the manifest stays
readable. Modern browsers (Chrome ≥ 91, Safari ≥ 18) accept SVG manifest
icons; older platforms fall back to the favicon.
