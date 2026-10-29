# Chess DAF ♞
Standalone, passwordless Arabic chess and learning at a Joo Flow URL. Each feature ships in a separate, reviewed pull request. PRs are stacked; deployment can use the tested final head before the stack is merged.

## Local development
Requires Python 3.12+. `uv venv && uv pip install -r requirements.txt pytest`; run `.venv/bin/python -m pytest -q`.

Run `CHESS_PUBLIC=1 CHESS_COOKIE_PATH=/ CHESS_ORIGIN=http://127.0.0.1:18971 .venv/bin/gunicorn 'backend.app:create_app()' --bind 127.0.0.1:18971 --workers 1 --threads 4`. No password or identity header is needed. Production must keep the backend loopback-only. POST requires JSON and the exact configured Origin. The old proxy-authenticated mode remains opt-in for legacy/internal tests when CHESS_PUBLIC is unset.

## Foundation
SQLite stores complete games and SAN/UCI moves. python-chess enforces legal moves, promotions, en passant, castling and game termination. Stale writes are rejected transactionally. Responsive RTL UI supports tap-to-move and all promotion choices. The foundation PR is a local two-sided board; engine/clock controls become active in the next PR.

## Security and licensing
Public access uses a random, HttpOnly browser cookie. Only its SHA-256-derived owner identifier is stored; games, reviews, exercises and progress are scoped server-side to that browser. The proxy forwards only this app cookie and clears legacy identity headers. Cookies are Secure on HTTPS, host-only and scoped to the app path. No credentials are checked into this repository. Clearing browser data or changing devices starts a new space; there is no account recovery or cross-device sync. Old shared-owner records remain preserved but are not handed to anonymous visitors. See `docs/reviews/` for scoped Marja reviews. GPL-3.0-or-later; chess rules and SVG piece designs come from [python-chess](https://github.com/niklasf/python-chess), © Niklas Fiekas and contributors. The pieces originate from Colin M. L. Burnett's chess set, distributed with python-chess under GPL. Stockfish integration is a separate UCI executable, never a browser download.

## Engine and clocks
Install distribution Stockfish (`apt-get install stockfish` on Ubuntu) or set `STOCKFISH_PATH` to a trusted binary. Native integration tests run when it exists. Levels map to Stockfish Skill Level 0/3/8/14/20; labels are relative strengths, not a verified Elo rating. One worker with four threads is required for the shared engine lock. Times: unlimited, 1, 3 and 10 minutes, without increment. Server time counts while disconnected, including engine thinking. Hints only in training on your turn. Safety limits: 600 half-moves, 2,000 saved games globally and 1,000 guest profiles; history shows the current browser's latest 100. The nginx route applies existing per-IP request/write limits; engine concurrency/resource caps remain enforced. Existing games remain saved when starting another.

## Arabic review
A completed game is analysed automatically in the UI, with retry and cached results. Every half-move gets a best alternative, legal continuation, Arabic lesson and centipawn loss from the mover's perspective. The score `/100` is our simple average `100*exp(-loss/300)`, not Chess.com's accuracy or an Elo rating. Quick searches may change their recommendation at greater depth. PGN can be exported without changing the game. No paid language model is required; explanations state verified chess facts with deterministic Arabic templates.

## Premove

The playing board keeps its 64 buttons and reuses piece images. Click/opponent moves use a short 110ms transform animation (disabled by reduced-motion preference); drag releases remain at the destination immediately while the server confirms the move. Rejected requests restore the confirmed board. This is a visual projection only: server legality, ownership and clocks are unchanged. Queue controls reserve a stable row so showing them does not resize the board. `tests/smooth.mjs` covers stable nodes, delayed replies, rejected drag rollback, real intermediate animation position and reduced motion; `tests/board-view-unit.mjs` covers capture, castling, en passant and promotion projection. No universal frame-rate guarantee is implied.
While Stockfish is thinking, tap your piece and its destination to queue one move (purple). A new choice replaces it. Cancel with the visible button, Escape or right-click. Promotion offers all four pieces. Future destinations show piece geometry; the move executes only if it is legal after the opponent reply. Illegal moves, captured source pieces, finished games, connection errors, reload and manual sync discard the queue. The server remains authoritative for legality, turn, stale-ply protection and clocks; network time still counts, including in one-minute games. There is no multi-move queue or zero-time guarantee.

Run `node --test tests/premove-unit.mjs`. For browser coverage, start `.venv/bin/python tests/premove_server.py /tmp/unique-premove.sqlite`, then use the same `CHESS_PLAYWRIGHT_MODULE` variable with `node tests/premove.mjs`. The loopback-only fixture adds scripted capture, promotion and checkmate positions inside its executable entry point; these routes are never registered by the production app. `CHESS_PREMOVE_LIVE=1 CHESS_TEST_URL=https://jooflow.space/chess-daf/` runs the common browser scenarios with native Stockfish, skipping fixture-specific positions.

## Drag pieces
On the playing board, hold and drag your piece with the mouse or one finger, then release on its destination. The piece follows your pointer and valid destinations are highlighted. Click-to-move and keyboard button activation remain available. Dragging during the opponent request queues a premove; promotion opens the existing four-piece chooser. An illegal/outside drop, Escape, pointer cancellation, lost capture/focus, board flip or a server position update cancels the drag. Touch dragging is confined to the board; scroll the page from outside it. Puzzle boards keep their existing tap controls.

With the isolated premove fixture running, use the same Playwright tooling variable with `node tests/drag.mjs`. It exercises actual mouse input and Chrome-emulated touch, one-minute play, exactly-once submission, legacy clicks/keyboard, invalid drops, cancellation, board flip, both colors, reply-during-drag, premoves and seeded underpromotion. `CHESS_DRAG_LIVE=1 CHESS_TEST_URL=https://jooflow.space/chess-daf/` runs common scenarios against native Stockfish, skipping the local promotion seed. Emulated touch is not a physical iOS/Android-device certification.

## Personal training
Three starter puzzles plus up to five exercises from your biggest inaccuracies per reviewed game. Your attempts, solved status and use of hints survive reload/restart. Personal exercises ask for the stored engine recommendation, not a claim that no alternative move is good. Progress shows recent 12 reviewed-game scores and weak concepts; it is not an official rating.

Browser verification: install `@playwright/test` in a disposable tooling directory. Run `.venv/bin/python tests/ui_server.py /tmp/unique-chess-test.sqlite`, then `CHESS_PLAYWRIGHT_MODULE=/absolute/path/to/@playwright/test/index.mjs node tests/browser.mjs` (Google Chrome installed). This uses a scripted test engine and separate SQLite database; production never imports it. Use a fresh disposable DB each run. The Python suite includes a separate native Stockfish integration test.

## Live installation
**https://jooflow.space/chess-daf/** — opens directly without Joo Flow login or doors. Runtime runs entirely on the server. See [deployment runbook](deploy/README.md) and [executed verification](docs/deployment-evidence.md). Feature PRs form an open stack (merge in dependency order); each includes a scoped Marja review. No PR has been merged by the build task.

Passwordless browser verification: start the fixture with `CHESS_PUBLIC=1`, run `tests/public-browser.mjs` for two-browser isolation and `CHESS_PUBLIC_TEST=1 ... node tests/browser.mjs` for the complete play/review/training path, using the same Playwright tooling variable.

Viewport regression: with the public isolated fixture running, use the same `CHESS_PLAYWRIGHT_MODULE` tooling variable with `node tests/layout.mjs`. It checks board/clocks/action geometry at laptop, wide/short desktop, mobile and tablet sizes, including notices, review navigation, scrollable panels and all promotion choices. Desktop play is height-bound; history/training pages and mobile settings retain normal page scrolling.
