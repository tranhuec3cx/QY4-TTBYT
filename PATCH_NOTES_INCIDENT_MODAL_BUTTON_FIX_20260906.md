# Incident modal button fix — 2026-09-06

- Fixed `+ Ghi nhận sự cố` not opening the modal.
- Root cause: the legacy `tickets.js` handler was assigned after async `loadData()` and overwrote the modal `onclick` handler.
- `tickets-ui.js` now uses a capture-phase click listener attached immediately when the script loads, so the modal opens reliably and the old `scrollIntoView` action is blocked.
- No API, database, or incident workflow logic changed.
