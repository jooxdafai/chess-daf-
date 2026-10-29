# Joo Flow deployment
Target: existing SSH alias `joo-flow`, Ubuntu 24.04. URL: **https://jooflow.space/chess-daf/**. This application is an owner workspace for anyone authorized to sign into this Joo Flow instance. It has no separate accounts or public registration.

## Boundaries
- App service runs as dedicated `chess-daf`, loopback-only 127.0.0.1:18971, one worker/four threads, 1 CPU, 384 MiB, 64 tasks, read-only host filesystem except its state directory.
- Only additive change to the existing TLS vhost: `include /etc/nginx/snippets/chess-daf.conf;` inside its first `server` block. Back up that file before changing it, run `nginx -t`, reload (not restart) nginx. Existing Joo Flow app and other services need no restart.
- Auth subrequest calls Joo Flow's `/api/health` with the existing session cookie. Unauthenticated access redirects to `/login`. The backend sees only fixed `X-Chess-User: owner`; auth cookies and Authorization are stripped. Never expose port 18971 externally or forward client identity headers.
- www requests for this path redirect to canonical jooflow.space; exact-Origin POST protection uses that canonical origin.

## Release layout / installation
Prepare trusted source under `/opt/chess-daf/releases/<git-sha>/`. Runtime dependencies from the pinned requirements live in `/opt/chess-daf/venv`; Ubuntu package `stockfish` provides `/usr/games/stockfish` (installed version 16-1build1). Run the full pytest suite on the target before activation.

Create dedicated system user/group `chess-daf` with shell `/usr/sbin/nologin`. State `/var/lib/chess-daf` is owned by that user, mode 0700; source and venv remain root-owned, not writable by the service. Set `/opt/chess-daf/current` to the reviewed release using an atomic symlink replacement. Install the included .service/.timer files in `/etc/systemd/system` and nginx snippet in `/etc/nginx/snippets`. Keep deployment/config before-images in `/var/backups/chess-daf/deploy-<UTC timestamp>/` (root only).

Enable/start `chess-daf.service`; confirm internal `/health`, private data requests with the fixed proxy identity, and that requests without identity return 401. Validate and reload nginx, then confirm unauthenticated HTTPS redirects to Joo Flow login. Authenticated browser QA can run against a separate database and loopback QA service over an SSH tunnel; do not populate the owner's game history with test games.

## Backups and restore
`chess-daf-backup.timer` runs daily at 03:45 UTC plus up to five minutes jitter, including catch-up after downtime. It uses SQLite online backup and integrity_check, not a raw copy of a live WAL database. `/var/backups/chess-daf/data` is 0700 owned by `chess-daf`; parent `/var/backups/chess-daf` is root:chess-daf 0710. Copies have 0600 permissions and unique UTC names. Existing files are never overwritten or deleted automatically; monitor disk use and archive older copies under an owner-approved policy.

Run the backup service once after install and verify a copy opens with integrity_check=ok. Restore only with the chess app stopped: preserve the current database **and its WAL/SHM sidecars** together before installing a verified snapshot with chess-daf ownership and 0600 permissions. Restart only this app. Never restore over an active SQLite connection.

## Rollback
Keep prior release symlink and nginx before-image. To roll back an app update, atomically point `current` at the prior reviewed release and restart only `chess-daf.service`. Restore the nginx before-image and validate before reloading only if routing changed. This initial release adds tables without modifying or deleting any other application's data. Backups/deployment snapshots are outside all web roots.

## Verification
`python -m pytest -q`, `node --check web/static/app.js`, `git diff --check`, native Stockfish test; browser E2E in `tests/browser.mjs` uses separate disposable data. Real-engine browser runs can override `CHESS_TEST_URL`; the test explicitly labels only the fixture in tests/ui_server.py as scripted. GitHub Actions verifies Python/native engine/JS on Ubuntu using commit-pinned actions and read-only token permissions.
