# Aurum Site — legal reader

Confirmed extension, 1 October 2026. Read mode for the player site: make terms and privacy information available before registration and while signed in. Preserve the incumbent Aurum identity, self-hosted Inter, dark/light neutral surfaces, violet controls and existing emblem. This surface establishes no new global design system.

## Confirmed behavior

- `/terms` and `/privacy` are real public links. The static reader is available before the session response, with an unavailable API and during maintenance. Modified clicks retain native link behavior.
- A full-screen native dialog has a document switcher and close control above one scrolling article. Prose uses a maximum 72ch container, 16px type and 1.7 line height; titles scale from 28px to 40px, section headings use 20px, and revision text uses 13px. Controls are at least 44px high. Mobile padding and the icon-only close control keep the header usable at 320px.
- Opening from a page preserves its form values and selected route. Escape, close and Back dismiss the reader; focus returns to the connected opener. Switching documents replaces the legal history entry, resets article scroll and focuses its heading. A directly opened document closes to `/login` or the signed-in home.
- Authentication forms retain full-text entry links. Below logout, desktop and the mobile drawer use one compact row, “Условия” and “Приватность”, with accessible names and tooltips. Only the incumbent 761–950px sidebar uses centered 44px icon links; the mobile drawer resumes text. Keep the links close to logout, without the rejected large vertical separation.

## Preservation and factual boundaries

Content lives in `apps/web/src/legal-content.ts`; the dialog and links live in `LegalDocuments.tsx`, with routing in `App.tsx` and authentication integration in `AuthPage.tsx`. Retain the confirmed operator Mark Kozyrau, Poland, `admin@aurumgg.ovh`, noncommercial status, SkillHost hosting and OVHcloud mail. Game linking, social features and payments remain conditional future clauses. Registration's terms notice is not blanket privacy consent; no server acceptance receipt was added.

For substantive text changes, update the revision constant, displayed date and `docs/legal.md`, and announce material changes. That document owns the remaining provider, transfer, retention, manual rights/deletion, social moderation and payment review work. This UI extension adds no assets, dependencies, backend features or production deployment.

## Review evidence and limits

The release record reports a passing build and four API tests. Nine local captures and GET-only mock-session checks cover both themes, desktop/mobile, the 850px rail, 320px header, form preservation, focus, scrolling, history and API/maintenance states; `results.json` records no console errors. This documentation pass sampled desktop/mobile readers, the rail and mobile drawer, and checked the source, contract, `docs/legal.md`, initial finish review and rail verdict. The verdict resolves the earlier rail overflow; the UI review of the latest compact footer in `compact-finish-review.md` is complete with `disposition: ship` and no material fixes. These checks do not certify legal compliance or production behavior.

Pre-existing drift is recorded without repair: root `DESIGN.md` is absent, and the older App surface brief still describes a pre-authentication draft. Neither becomes authority for this extension; no global rules or raster provenance were changed.
