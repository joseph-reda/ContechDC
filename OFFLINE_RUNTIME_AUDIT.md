# Offline runtime dependency audit

Audit date: 2026-11-02

## Core application

| Dependency or asset | Feature | Runtime network requirement | Offline impact |
| --- | --- | --- | --- |
| Tailwind CSS | Application utility classes and responsive layout | None after `npm install` and `npm run build`. Tailwind is compiled by the local Vite plugin into `dist/assets/*.css`. | Core styling works without internet access. |
| React, React DOM, React Router | Frontend application and routing | None. They are bundled into local production JavaScript assets. | Core navigation works without internet access. |
| Contech image and favicon | Branding | None. Both are served from local project assets. | No offline impact. |
| Node API and SQLite | Authentication, records, archive, reports, and project configuration | Requires the local Contech server, but no internet service. | Core workflows work on the local server/LAN without internet access. |
| Word and Excel templates | Document and report generation | None. Templates are bundled under `backend/templates` and `Files`. | Exports work without internet access. |
| Browser Clipboard API | Copy and Copy All | No internet service. Browser permission/security rules still apply; a local legacy copy fallback is present. | Copy can work offline, subject to browser permission. |

## Optional remote integration

`backend/import-legacy-project-data.js` connects to Google OAuth and Firestore. It is an explicitly invoked migration command (`npm run migrate:legacy-projects`), not an application startup dependency and not part of normal record, archive, copy, authentication, Word, or report workflows. The migration command cannot run without internet access and Google credentials; failure does not prevent the core application from starting or operating on SQLite.

## Result

No remote script, stylesheet, font, icon service, chart library, editor, service worker, or manifest dependency is loaded by the production frontend. The configured frontend API defaults to same-origin `/api`; development proxies it to the local Node server. A custom `VITE_API_URL` can intentionally point elsewhere, in which case that deployment's availability becomes a runtime requirement.
