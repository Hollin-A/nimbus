# 0004 — Open-Meteo for weather data

**Status:** Accepted
**Date:** 2026-05-25

## Context

Nimbus needs current weather for any city the user picks. The brief allows
any free weather API. Three candidates were considered:

1. **Open-Meteo** — no API key, generous limits, well-documented.
2. **OpenWeatherMap** — requires an API key; the free tier is rate-limited
   and requires email signup.
3. **WeatherAPI.com** — requires an API key.

## Decision

Use Open-Meteo for both geocoding and forecast:

- `GET https://geocoding-api.open-meteo.com/v1/search?name=<q>` for city
  search.
- `GET https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=…&daily=…&timezone=auto`
  for current conditions and the day's high/low.

WMO weather codes (0–99) are mapped to a human-readable label and one of
eight icon keys (`clear`, `partly-cloudy`, `cloudy`, `fog`, `drizzle`,
`rain`, `snow`, `thunderstorm`) by a pure function `describeWeatherCode`.

A small in-memory cache, keyed by `(lat, lon)` rounded to 4 decimal places,
holds each city's forecast for 5 minutes. Cache hits re-apply the caller's
`name`/`country` so two requests for the same coords with different labels
both look right to the client.

## Consequences

**Positive**

- No API key. Reviewers run the repo cold with zero setup — no account
  creation, no env var to populate, no rate-limit dashboard to monitor.
- 10,000 requests/day on the public tier is more than enough for the demo.
  The 5-minute cache keeps real upstream traffic far below that even under
  a stress test.
- Two clean JSON endpoints; no SDK to wrap.

**Negative / mitigated**

- Upstream availability is out of our hands. The service throws a
  `WeatherError` with HTTP status 502 when upstream returns non-2xx, the
  network call fails, or the JSON is unparseable. The route surfaces that
  502 to the client; the frontend renders a friendly retry card.
- WMO code coverage is good but not 100 % (codes 4–44 and a few others are
  unassigned). `describeWeatherCode` returns a generic fallback rather than
  throwing, so an unknown code shows as "Unknown conditions" with a cloudy
  icon instead of breaking the UI.
- The coords-only cache key means two display names for the same point
  share a cache entry. We re-apply the caller's `name`/`country` on cache
  hit, so the returned object always matches what the caller asked for.

## Library choices

- Built-in `fetch` (Node 18+) — no third-party HTTP client needed for two
  GET requests with no special headers or auth.
