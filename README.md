# T640 Live Dashboard

Static public dashboard for the T640 hourly Google Sheets feed.
https://naodiw.github.io/t640-dashboard/

## Data path

1. `window.T640_CACHE_API` (Cloudflare Worker, repo `naodiw/envidas-worker`, `src/t640.js`):
   quick ranges (24h/7d/30d/90d/1y, resolution auto) are pre-fetched every 5 minutes and answered in ~0.1–0.5 s.
   Custom periods are proxied to Apps Script and edge-cached for 5 minutes.
2. If the Worker fails, the page falls back to `window.T640_DASHBOARD_API`
   (Google Apps Script public read-only endpoint, JSONP) exactly as before.
3. The last successful quick-range response is kept in `localStorage` and shown immediately on the next visit.
   `latest.ageMinutes` / `stale` are recomputed from `latest.updatedTs` in the browser, since cached data may be minutes old.

ECharts is vendored in `vendor/` (no external CDN).
