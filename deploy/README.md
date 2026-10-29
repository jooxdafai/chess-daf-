# Joo Flow deployment
Target: existing SSH alias `joo-flow`, Ubuntu 24.04. URL: **https://jooflow.space/chess-daf/**. This application opens directly without Joo Flow doors, login, password or registration. Each browser has an independent anonymous workspace.

## Boundaries
- App service runs as dedicated `chess-daf`, loopback-only 127.0.0.1:18971, one worker/four threads, 1 CPU, 384 MiB, 64 tasks, read-only host filesystem except its state directory.
- Only additive change to the existing TLS vhost: `include /etc/nginx/snippets/chess-daf.conf;` inside its first `server` block. Back up that file before changing it, run `nginx -t`, reload (not restart) nginx. Existing Joo Flow app and other services need no restart.
- No Joo Flow auth subrequest or login redirect. Set CHESS_PUBLIC=1. Forward only `chess_daf_guest`, clear `X-Chess-User` and Authorization, and never expose port 18971 externally. Existing daf_pages/daf_write nginx zones bound per-IP requests/writes. Cookie path is /chess-daf/, Secure + HttpOnly + SameSite=Lax; guest identity comes from a 256-bit browser token, never an owner request parameter.
- www requests for this path redirect to canonical jooflow.space; exact-Origin POST protection uses that canonical origin.

## Release layout / installation
Prepare trusted source under `/opt/chess-daf/releases/<git-sha>/`. Runtime dependencies from the pinned requirements live in `/opt/chess-daf/venv`; Ubuntu package `stockfish` provides `/usr/games/stockfish` (installed version 16-1build1). Run the full pytest suite on the target before activation.

Create dedicated system user/group `chess-daf` with shell `/usr/sbin/nologin`. State `/var/lib/chess-daf` is owned by that user, mode 0700; source and venv remain root-owned, not writable by the service. Set `/opt/chess-daf/current` to the reviewed release using an atomic symlink replacement. Install the included .service/.timer files in `/etc/systemd/system` and nginx snippet in `/etc/nginx/snippets`. Keep deployment/config before-images in `/var/backups/chess-daf/deploy-<UTC timestamp>/` (root only).

Enable/start `chess-daf.service`; confirm internal `/health`, private data requests with the fixed proxy identity, and that requests without identity return 401. Validate and reload nginx, then confirm public HTTPS returns 200 with no login redirect and a new browser cookie. Browser QA can run against a separate database and loopback QA service over an SSH tunnel. Confirm two independent cookies cannot read/mutate each other's games or progress. Do not reuse the owner's browser cookie for QA.

## Backups and restore
`chess-daf-backup.timer` runs daily at 03:45 UTC plus up to five minutes jitter, including catch-up after downtime. It uses SQLite online backup and integrity_check, not a raw copy of a live WAL database. `/var/backups/chess-daf/data` is 0700 owned by `chess-daf`; parent `/var/backups/chess-daf` is root:chess-daf 0710. Copies have 0600 permissions and unique UTC names. Existing files are never overwritten or deleted automatically; monitor disk use and archive older copies under an owner-approved policy.

Run the backup service once after install and verify a copy opens with integrity_check=ok. Restore only with the chess app stopped: preserve the current database **and its WAL/SHM sidecars** together before installing a verified snapshot with chess-daf ownership and 0600 permissions. Restart only this app. Never restore over an active SQLite connection.

## Rollback
Keep prior release symlink and nginx before-image. To roll back an app update, atomically point `current` at the prior reviewed release and restart only `chess-daf.service`. Restore the nginx before-image and validate before reloading only if routing changed. Passwordless migration adds owner columns to games/puzzles and a guests registry, preserving original rows as owner=owner. An old pre-migration binary cannot safely write the new schema. To roll back across that migration, stop only Chess DAF, preserve the current database and WAL/SHM sidecars together, restore the verified pre-migration snapshot with chess-daf ownership, and restore the previous unit, nginx snippet and release together. Keep the preserved current database for later recovery; never discard new guest data. Backups/deployment snapshots are outside all web roots.

## Verification
`python -m pytest -q`, `node --check web/static/app.js`, `git diff --check`, native Stockfish test; browser E2E in `tests/browser.mjs` uses separate disposable data. Real-engine browser runs can override `CHESS_TEST_URL`; the test explicitly labels only the fixture in tests/ui_server.py as scripted. GitHub Actions verifies Python/native engine/JS on Ubuntu using commit-pinned actions and read-only token permissions.

## Public storage bounds
The guest registry is limited to 1,000 profiles and games to 2,000 globally. When the profile cap is reached, existing browser spaces continue to work; new spaces receive 429 until an owner-approved archival/capacity decision. No guest histories are deleted automatically. Losing the anonymous cookie starts a new space; prior records remain preserved but cannot be claimed by another visitor.
