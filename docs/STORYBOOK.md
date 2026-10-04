# HapuTele Storybook

Storybook uses the real Next.js pages, layouts, clinical modules and primitives. The [codebase walkthrough and complete feature inventory](CODEBASE.md) is also available inside **Start here / Codebase walkthrough**; **Start here / Using this Storybook** explains the interactive journeys and preview limits.

## Run

From `frontend/`, using Node 24 (verified):

```bash
npm ci --legacy-peer-deps
npm run storybook
```

Default URL: http://localhost:6006. If that port is occupied:

```bash
npm run storybook -- --port 6016
```

No API, Postgres, object store, LiveKit, Resend credentials or `.env` file is required. Storybook forcibly uses the same-origin `/api` prefix and MSW intercepts it; a configured production `NEXT_PUBLIC_API_URL` is not used. The generated worker in `frontend/public/mockServiceWorker.js` is registered only by the Storybook preview, not the application.

## Build

```bash
npm run build-storybook
npm run typecheck
npx biome check src/stories .storybook
```

`frontend/storybook-static/` is a portable static site and is gitignored. Serve it over localhost or HTTPS, not `file://`: service workers require a secure context. Host it at the origin root, matching the worker and application's root-relative paths. No production frontend/server build or API generation is required to build Storybook.

## Catalog

The integrated catalog contains 314 canvas stories, 50 interaction plays and 54 documentation entries:

- **Start here:** usage, architecture, complete route/feature map, role stories, backend-only capabilities and implementation gaps.
- **Journeys / End to end:** initialize clinic; sign in/search/open patient; signed-consent registration; atomic queue booking; consultation draft/review/sign/follow-up; invite doctor; approve application; update institute identity.
- **Screens / Public:** root routing, login/denials, setup, new/rotation/expired onboarding, phone capture/expiry, not-found.
- **Screens / Healthworker:** booking workspace/deep links/loading/empty/error; patients/intake; queue; availability; exports; seven appointment lifecycle states and expired master consent.
- **Screens / Doctor:** calendar/readiness; appointment context; draft/live-panel/locked consultation; availability; practice profile.
- **Screens / Administration:** invites/roster/errors/approval/setup/rejection, healthworker accounts, system settings, mixed roster and invite/manual doctor creation.
- **Clinical:** demographic/intake/profile/picker/context; vitals/photos; forms/list/calendar/cockpit; queue intake/duplicate confirmation/booking/cancel; patient review/history; 15-minute slot selection; 30-minute week painting; all structured consultation editors/review/sign/follow-up states; doctor stamp upload/crop/rotation/transparency; video availability and unconfigured-service error.
- **Primitives, Shell and Marketing:** real controls/variants, calendar keyboard/bounds, error/retry/reference, loading/empty, dialogs, image/camera/QR, signature canvases/input, four-role chrome, version states and login graphic.

Canvas stories with a `play` function execute the user interactions automatically. The **Interactions** panel shows the steps and assertions; replay/reset restores fresh synthetic API records and React Query/auth state. Full-screen route stories navigate between the real pages inside one scenario. Ctrl/Meta-click and external/download links keep native behavior. Normal isolated component links use framework router action mocks.

## Files and extension points

| File | Responsibility |
| --- | --- |
| `frontend/.storybook/main.ts` | Next.js/Vite framework, docs/a11y addons, static assets, alias and API isolation |
| `frontend/.storybook/preview.tsx` | Self-hosted original fonts/styles, real providers, fresh-per-render MSW lifecycle and story sorting |
| `frontend/src/stories/fixtures.ts` | Typed, entirely synthetic domain records; dates relative to current clinic day |
| `frontend/src/stories/scenario.ts` | Scenario options and explicit stateful API response handlers |
| `frontend/src/stories/screen.tsx` | Story-only App Router navigation and real route/layout composition |
| `frontend/src/stories/journeys.stories.tsx` | Actual multi-screen/form user journeys |
| `frontend/src/stories/screens/` | Role/public route and state coverage |
| `frontend/src/stories/clinical/`, `primitives/`, `shell/`, `administration/` | Focused real-module stories |
| `frontend/src/stories/downloads.ts` | Valid labelled synthetic PDF/XLSX/ZIP samples for download controls |
| `frontend/src/stories/*.mdx` | Walkthrough and guide inside the sidebar |

Add stories with the existing CSF3 pattern, real module imports and `scenario({ role, appointmentStatus, ... })`. A story's local MSW handler array overrides the shared handlers in order; the preview appends a freshly created base scenario. Unknown `/api` operations fail visibly with `storybook_unimplemented_endpoint` rather than reaching a real backend or receiving an invented success. Add the real operation's wire shape before relying on a new query/mutation. Do not manually edit `src/gen`.

The route harness preserves a page on query-string changes (queue deep-link consumption) but remounts it when pathname changes. Numeric route parameters and public tokens are supplied through the framework navigation mocks. It does not replace production auth or routing code. The root/server redirect is represented by its real destination; this is not a Next server runtime.

Dates use the real clock. Current-day fixture appointments remain visible in calendar stories, but an available booking slot may have elapsed by the time a story is opened. No clock replacement conceals production past-slot behavior.

## Verification and limits

Verified against the built static site: **314/314 canvas stories rendered and all 50 interaction plays completed without story/play exceptions or unimplemented API operations**. TypeScript and the scoped Biome check passed. Desktop booking-workspace and 390 px patient-record previews were inspected; the mobile record had no document horizontal overflow and used the original Calistoga display face. Both export buttons produced browser downloads; the XLSX sheet and ZIP/PDF contents were inspected and contained only labelled synthetic data.

`npm run build-storybook` completed successfully. Vite reports client-directive/sourcemap and large-chunk warnings when bundling the incumbent application and generated API layer; these are not suppressed. No backend tests, real provider calls, security/transaction verification or full accessibility-compliance audit were performed.

- **Video:** no usable LiveKit token is issued and no clinical room is contacted. Start/join uses the real `livekit_not_configured` error; fixture lifecycle states are UI examples, not a performed call.
- **Email:** invite/approval records are synthetic. No Resend delivery, provider callback or suppression is tested.
- **Consent/signatures:** canvas journeys draw pixels; saved signature/stamp images are illustrations. These are not legally valid signatures/consents or real patient records.
- **Camera/phone:** deterministic denied/unsupported/no-device/expired states are included. Success requires camera hardware/permissions and a real reachable backend for companion-phone transfer. Preview tokens are inert.
- **Downloads:** real UI handlers create browser downloads from valid synthetic PDF/XLSX/ZIP blobs. Their content is explicitly nonclinical; production PDF formatting, export filtering and manifests require server integration verification.
- **Security/transactions:** MSW is not a database or security implementation. Server ACLs, cookie/CSRF enforcement, row locks, uniqueness, audit trails and atomic transactions remain backend responsibilities.
- **Accessibility:** the addon reports the incumbent UI. Existing modal focus-trap and unlabeled-field limitations are preserved, not represented as passing compliance.

Primary integration references: [Storybook Next.js/Vite](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite), [MSW Storybook addon CSF3 integration](https://github.com/mswjs/msw-storybook-addon#csf-30). Storybook 10.6.1 and MSW addon 3.0.3 are pinned in the lockfile.
