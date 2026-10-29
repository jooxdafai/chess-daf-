# Chess DAF ♞
Private Arabic chess and learning, hosted under Joo Flow. Each feature ships in a separate, reviewed pull request. PRs are stacked; deployment can use the tested final head before the stack is merged.

## Local development
Requires Python 3.12+. `uv venv && uv pip install -r requirements.txt pytest`; run `.venv/bin/python -m pytest -q`.

Run `CHESS_ORIGIN=http://127.0.0.1:18971 .venv/bin/gunicorn 'backend.app:create_app()' --bind 127.0.0.1:18971 --workers 1 --threads 4`. For local development the trusted reverse proxy must set `X-Chess-User: owner` (a browser test context can inject this header). Production must **never** publish the backend port or trust client-provided identity headers. POST requires JSON and the exact configured Origin.

## Foundation
SQLite stores complete games and SAN/UCI moves. python-chess enforces legal moves, promotions, en passant, castling and game termination. Stale writes are rejected transactionally. Responsive RTL UI supports tap-to-move and all promotion choices. The foundation PR is a local two-sided board; engine/clock controls become active in the next PR.

## Security and licensing
The app is a single-owner workspace behind Joo Flow authentication, not a multi-tenant service. No credentials are checked into this repository. Production must proxy only authenticated requests and overwrite `X-Chess-User` with the fixed owner identity. See `docs/reviews/` for scoped Marja reviews. GPL-3.0-or-later; chess rules and SVG piece designs come from [python-chess](https://github.com/niklasf/python-chess), © Niklas Fiekas and contributors. The pieces originate from Colin M. L. Burnett's chess set, distributed with python-chess under GPL. Stockfish integration is a separate UCI executable, never a browser download.
