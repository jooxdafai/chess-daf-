# Chess DAF — deployment evidence, 2026-10-29

## Current visual release: viewport-fitting board — 2026-10-29
- Runtime: 7298964f73eaefdfadebb649e847f4d4f8baeb3b at https://jooflow.space/chess-daf/. Evidence-only follow-up changes no runtime files.
- Board size responds to available width **and height**, including notices and review navigation. Both clocks and playing controls remain visible. Compact desktop title/header, bounded side panels, scrollable setup options with pinned new-game action, and wrapping promotion choices. Mobile settings/history/training retain normal page scrolling.
- Reproduced prior vertical clipping before implementation. `tests/layout.mjs` now passes on the actual public HTTPS app with native Stockfish: 1366x768, 2000x1050, 1440x900, 1280x720, 1024x600, 960x540 and 1920x650 in initial, notice and review states. Verified square board, clocks/controls/new-game/panels in viewport and no desktop vertical page scroll.
- Mobile/tablet checks: 390x844, 360x640, 768x1024, 844x390 without horizontal overflow; portrait board/clocks/controls fit. Review navigation, sidebar scrolling, promotion choices and other tabs passed. Laptop/short-screen/mobile screenshots inspected.
- Existing full browser gameplay/review/training/persistence suite passed locally on the scripted fixture. No JS page errors. These are Chrome checks, not universal browser or accessibility certification.
- Deployment byte-compared backend/config/JS/requirements with the preceding live release: unchanged. Served CSS hash verified. Only chess-daf.service restarted; no database migration, nginx rewrite or Joo Flow restart. Anonymous browser spaces and passwordless access remain intact.
- Rollback pointer: /var/backups/chess-daf/viewport-layout-20261029T175513Z/previous-release.txt. Repoint release and restart only Chess DAF; no database restore needed for this layout-only update.


## Prior dark theme: colors retained, layout superseded above — 2026-10-29
- Live: https://jooflow.space/chess-daf/ ; runtime revision 24f8950ea23072ecf4088b228e4bf02416ed003d. Later evidence-only commits change no runtime files.
- Charcoal surfaces, softer green actions, readable Arabic text, distinct board/check/selection/status colors, native dark form controls and SVG progress-chart palette. Mobile browser theme-color matches the page.
- Public Chrome computed-style checks passed: sampled text minimum contrast 4.98:1, board square contrast 2.07:1; no horizontal overflow at 360px/390px or JS errors. Desktop/mobile/training screenshots inspected. This is a scoped check, not a complete accessibility certification.
- Full play/bot/reload/hint/resign/review/alternative/exercise/persistence browser flow passed against an isolated scripted fixture. No Python/native-engine rerun was required for the static-only change. Backend, engine, session, storage and deployment files were byte-compared against the prior live release before activation and were identical.
- Served stylesheet hash verified against the reviewed release after restarting only chess-daf.service. No database migration, configuration rewrite or nginx/Joo Flow restart. The app remains standalone and passwordless.
- Rollback pointer: /var/backups/chess-daf/dark-theme-20261029T173533Z/previous-release.txt. Returning the release symlink and restarting only this app is sufficient for this CSS-only update; no database rollback.


## Passwordless release: access model unchanged, visual source superseded above — 2026-10-29
- https://jooflow.space/chess-daf/ opens directly, HTTP 200, without a Joo Flow login or doors.
- Runtime revision: 553471ef741f9bd63780a71242ec3bf9cfafe94f. Evidence-only follow-ups do not change runtime files.
- Guest workspaces use app-scoped random browser cookies, owner-filtered games/reviews/exports, isolated exercises and progress. Old owner data is retained; before migration there were 0 games and 3 starter exercises, preserved exactly.
- Pre-migration rollback bundle: /var/backups/chess-daf/passwordless-20261029T172555Z (prior release, unit/snippet before-images, verified pre-migration SQLite snapshot and deployment script). Rollback across the schema migration requires restoring that database snapshot with the old runtime/config; preserve any post-migration data first.
- Full Linux suite **32 passed**; local **31 passed, 1 native-only skipped**. Includes public access, every cross-browser game route, independent practice/progress, old-schema migration and storage bounds.
- Actual public HTTPS Chrome tests used fresh browser contexts, no Joo Flow session and no identity header: native-engine full game/review/training path passed; two-browser isolation, reload and stale-session recovery also passed. Desktop/mobile layout checks passed. Tests used separate anonymous guest identities, not the owner's browser.
- App/nginx/Joo Flow API/backup timer all active; post-migration backup completed successfully. The only changed host configurations were this app's systemd unit and nginx snippet; shared door configuration stayed unchanged. Temporary local fixture stopped.
- Guest histories are browser-specific and survive reload/restart while the cookie remains. There is no account/password recovery or cross-device sync.

## Historical: original protected deployment (superseded above)

- Live: https://jooflow.space/chess-daf/ (existing Joo Flow login).
- Runtime source revision: `7a27099d90b638a9476ccbf4a7bf50d5d1966f1b`. Later evidence-only commits do not change runtime source.
- Target: SSH `joo-flow`, vmi3506881. Service `chess-daf.service` under dedicated `chess-daf`; source `/opt/chess-daf/current` → `/opt/chess-daf/releases/7a27099d90b638a9476ccbf4a7bf50d5d1966f1b`.
- State: `/var/lib/chess-daf/chess.sqlite`, private 0700 directory. Production games/progress were verified empty after QA; starter exercises = 3.
- Nginx before-image: `/var/backups/chess-daf/deploy-20261029T170642Z/joo-flow-os.before`. The only vhost edit was adding the Chess DAF snippet include. `nginx -t` passed; it reported a pre-existing protocol-options redefinition warning on the shared TLS listener. Nginx was reloaded; Joo Flow API was not restarted.
- Native engine: distribution Stockfish 16-1build1; search is isolated through UCI. App bound only to `127.0.0.1:18971`.
- Actual service properties: `User=chess-daf`, `MemoryMax=402653184`, `CPUQuotaPerSecUSec=1s`, `TasksMax=64`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/chess-daf`, `NRestarts=0` at verification.

## Executed verification
- Full Linux suite: **24 passed** at initial hosting revision `5f69ed4`; subsequent runtime changes were only browser readiness/opacity. Native play, analysis and checkmate review are included. Local Python suite: **23 passed, 1 native-only skipped**.
- Final runtime revision passed server JS syntax check, local diff check and full native-engine Chrome E2E through an SSH-only QA instance with a separate SQLite database: play, reply, refresh recovery, hint, resignation, automatic review, suggested alternative, solve exercise, persisted progress, fresh-game lesson reset, black-side 1-minute match, correct board orientation and match-mode hint rejection.
- The browser suite deliberately held the create request to prove that early clicks wait for readiness; this regression failed before the fix and passed afterwards.
- Chrome desktop/mobile (390px) screenshots inspected; no JS page errors or horizontal mobile overflow in the exercised path.
- HTTPS unauthenticated `/chess-daf/` returned **303 /login**. An unauthenticated `/chess-daf/api/games` with spoofed `X-Chess-User: owner` also returned **303 /login**. Backend state without proxy identity is rejected in HTTP tests; exact Origin and JSON rules tested.
- Production health `{"app":"chess-daf","status":"ok"}`; app, nginx, Joo Flow API and backup timer active. No test game was written into the production database.
- Daily backup service completed successfully. Snapshot opened with `integrity_check=ok`, three starter puzzles and mode 0600. Backup test restored the pre-move and post-move copies and verified that reusing a destination cannot overwrite the earlier snapshot.
- Temporary native QA service, SSH tunnel and local scripted fixture were stopped after verification.

## Limits
The native browser E2E used the real server app/engine with a trusted identity header over a private SSH tunnel, not a captured/reused owner login session. Public login rejection was tested and positive session validation was traced to Joo Flow's existing `/api/health` authentication code; the owner's authenticated login click-through was not automated. All authenticated Joo Flow users share the owner workspace by design. Quick engine scores/performance indicators are approximate. PRs remain open as a stack; no merge was performed. CI outcome is separate from these executed server/local checks.
