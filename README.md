# Chess DAF ♞
Private Arabic chess and learning, hosted under Joo Flow. Each feature ships in a separate, reviewed pull request. PRs are stacked; deployment can use the tested final head before the stack is merged.

## Local development
Requires Python 3.12+. `uv venv && uv pip install -r requirements.txt pytest`; run `.venv/bin/python -m pytest -q`.

Run `CHESS_ORIGIN=http://127.0.0.1:18971 .venv/bin/gunicorn 'backend.app:create_app()' --bind 127.0.0.1:18971 --workers 1 --threads 4`. For local development the trusted reverse proxy must set `X-Chess-User: owner` (a browser test context can inject this header). Production must **never** publish the backend port or trust client-provided identity headers. POST requires JSON and the exact configured Origin.

## Foundation
SQLite stores complete games and SAN/UCI moves. python-chess enforces legal moves, promotions, en passant, castling and game termination. Stale writes are rejected transactionally. Responsive RTL UI supports tap-to-move and all promotion choices. The foundation PR is a local two-sided board; engine/clock controls become active in the next PR.

## Security and licensing
The app is a single-owner workspace behind Joo Flow authentication, not a multi-tenant service. No credentials are checked into this repository. Production must proxy only authenticated requests and overwrite `X-Chess-User` with the fixed owner identity. See `docs/reviews/` for scoped Marja reviews. GPL-3.0-or-later; chess rules and SVG piece designs come from [python-chess](https://github.com/niklasf/python-chess), © Niklas Fiekas and contributors. The pieces originate from Colin M. L. Burnett's chess set, distributed with python-chess under GPL. Stockfish integration is a separate UCI executable, never a browser download.

## Engine and clocks
Install distribution Stockfish (`apt-get install stockfish` on Ubuntu) or set `STOCKFISH_PATH` to a trusted binary. Native integration tests run when it exists. Levels map to Stockfish Skill Level 0/3/8/14/20; labels are relative strengths, not a verified Elo rating. One worker with four threads is required for the shared engine lock. Times: unlimited, 1, 3 and 10 minutes, without increment. Server time counts while disconnected, including engine thinking. Hints only in training on your turn. Safety limits: 600 half-moves, 2,000 saved games; history shows latest 100. Existing games remain saved when starting another.

## Arabic review
A completed game is analysed automatically in the UI, with retry and cached results. Every half-move gets a best alternative, legal continuation, Arabic lesson and centipawn loss from the mover's perspective. The score `/100` is our simple average `100*exp(-loss/300)`, not Chess.com's accuracy or an Elo rating. Quick searches may change their recommendation at greater depth. PGN can be exported without changing the game. No paid language model is required; explanations state verified chess facts with deterministic Arabic templates.

## Personal training
Three starter puzzles plus up to five exercises from your biggest inaccuracies per reviewed game. Your attempts, solved status and use of hints survive reload/restart. Personal exercises ask for the stored engine recommendation, not a claim that no alternative move is good. Progress shows recent 12 reviewed-game scores and weak concepts; it is not an official rating.

Browser verification: install `@playwright/test` in a disposable tooling directory. Run `.venv/bin/python tests/ui_server.py /tmp/unique-chess-test.sqlite`, then `CHESS_PLAYWRIGHT_MODULE=/absolute/path/to/@playwright/test/index.mjs node tests/browser.mjs` (Google Chrome installed). This uses a scripted test engine and separate SQLite database; production never imports it. Use a fresh disposable DB each run. The Python suite includes a separate native Stockfish integration test.
