# Marja — single pending premove, 2026-10-29

No confirmed feature-related security vulnerabilities found within the reviewed scope.

## Boundary and revision

Reviewed the final working-tree diff against `5297bf6` (`chess/08-viewport-layout`): browser queue/module, HTML/CSS, local-only browser fixtures and tests, CI and README. Reviewed the actual callers and shared server guards in `backend/app.py`, `backend/game.py`, plus the unchanged nginx/systemd configuration. The current conversation agent performed the review directly using the Marja skill; no delegated reviewer was used. The implementation commit containing this report identifies the reviewed source revision; subsequent deployment evidence changes no runtime code.

## Traced controls

- `web/static/app.js:85–114` queues only during the pending opponent request and removes the queue before sending a normal `/move` request. A new game, terminal result, request failure, cancellation or manual sync clears it. There is one in-memory slot; no persisted replay or alternate privileged endpoint.
- `web/static/premove.mjs:27–29` requires matching game identity, exactly one subsequent ply, an unfinished game, the human turn and membership in the latest server legal-move list. Geometry preview is deliberately not an authority. The normal move endpoint still receives an explicit ply.
- `backend/app.py:40–62,128–140` still enforces exact Origin, JSON and cookie-derived owner scoping for both bot and human writes. `backend/game.py:49–53,122–156` reads by owner and applies turn/ply/clock/legality checks inside the write transaction. Editing browser state cannot bypass those checks or move another browser's game. Queries remain parameter-bound.
- New status text uses `textContent`; highlight classes and destination generation are bounded to the board. No HTML injection, executable input, external URL, dependency or credential path is introduced.
- `tests/premove_server.py` registers its seed-position routes only inside `if __name__ == '__main__'` and binds to loopback. Production `create_app()` does not import this fixture. The service still starts the production factory, with the existing CPU/memory limits and fixed native engine.
- CI adds only a bounded Node unit test with read-only workflow permissions; pinned actions and existing install commands are unchanged.

## Executed verification

- Python suite: **31 passed, 1 skipped** (native Stockfish unavailable locally).
- Node premove unit suite: **3 passed**; JS syntax and `git diff --check` passed.
- Chrome deterministic browser suite: timed one-minute game, exactly-once execution, both colors, queue replacement, flip, cancel button/Escape/right-click, conditional capture, illegal destination, captured source, request failure then sync without replay, underpromotion and checkmate cancellation; terminal review returned HTTP 200.
- Full existing browser play/review/training/persistence flow and viewport regression passed. Premove controls also fit at 960×540 and 390×844. Screenshots inspected.

## Limits and remaining candidates

No unresolved feature-related security candidates. This is a scoped source review, not a dependency-advisory audit or a whole-project security certification. Special capture/promotion/mate positions use the isolated scripted engine; separate live smoke evidence records which common cases ran with native Stockfish. Queue previews can include destinations currently blocked or unsafe and are discarded if still illegal after the reply. Server clock/network latency remains real; this feature does not promise zero-time moves. Chrome coverage does not certify other browsers or full accessibility.
