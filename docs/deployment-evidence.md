# Chess DAF — deployment evidence, 2026-10-29

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
