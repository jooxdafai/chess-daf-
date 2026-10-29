# Marja — pointer drag on the playing board, 2026-10-29

No confirmed feature-related security vulnerabilities found within the reviewed scope.

## Scope and revision

Direct review by the current conversation agent using Marja; no delegated agent. Reviewed the actual final diff against `aa9ba6e` (`chess/09-premove`): `web/static/drag.mjs`, its `app.js` adapter/lifecycle hooks, scoped CSS, browser regression test, README and one additional CI syntax check. Traced the unchanged move/premove callers, backend ownership/Origin/rules/clock guards and nginx/service deployment configuration. The implementation commit containing this report identifies the reviewed source; later deployment evidence changes no runtime code.

## Verified paths and guards

- `drag.mjs:15–47` accepts one primary pointer on a board piece, waits for meaningful movement, resolves the destination from the actual DOM square inside that board, and checks position identity plus caller legality before dispatch. Cleanup precedes `onDrop`; duplicate pointer-up or trailing click cannot dispatch the same drag again. It makes no requests itself.
- `app.js:136–147` limits dragging to the current human's pieces in a live playable state and routes a drop into the existing `onSquare` path. Normal moves carry the current ply; premoves use the existing single-slot resolver. A server update cancels an in-progress drag before accepting its new position; flip, Escape/manual cancellation and focus/pointer loss also clean up the ghost. Client geometry is not treated as server authority.
- `backend/app.py:40–62,128–140` still requires exact Origin and JSON on writes and establishes the cookie-derived owner. `backend/game.py:49–53,125–156` still queries by owner and enforces ply, turn, clock, terminal state and python-chess legality transactionally. No server route, DB schema, cookie, dependency or runtime configuration changed. Editing local drag state cannot bypass these boundaries.
- The visual ghost clones the app's existing piece image; new CSS values are numeric pointer coordinates and measured dimensions. There are no new HTML-string, shell, external-request or credential sinks. Pointer tracking holds one record and one ghost and clears them on completion/cancellation.
- Touch-action suppression is limited to `#board`; existing puzzle/page interactions remain outside that restriction. The single controller is attached once to the permanent playing board, so listeners do not accumulate during redraws.
- CI adds only `node --check web/static/drag.mjs` under the existing read-only permissions and pinned actions. Browser fixture routes remain confined to the already-existing standalone loopback test script and are not registered by the production app.

## Executed evidence

- Before implementation, a real mouse drag failed because no held-piece visual or move existed; after implementation the same check passed.
- Dedicated Chrome browser suite passed: timed mouse drag, visual follows pointer/valid target, exactly-once move, existing clicks and keyboard activation, illegal/friendly/outside/opponent drops, Escape/flip/blur cancellation, flipped white and black play, drag-created premove, bot reply during drag, emulated mobile touch drag/cancel/premove without page scrolling, and local seeded underpromotion. No JavaScript page errors; desktop/mobile held-piece screenshots inspected.
- Existing complete premove, gameplay/review/training/persistence and viewport suites passed with the isolated scripted engine. Local Python **31 passed, 1 native-only skipped**; Node premove **3 passed**; both JS syntax checks and `git diff --check` passed.

## Limits

No unresolved feature-related security candidates. This is a scoped source review, not a whole-project or dependency-advisory clearance. Touch was exercised through Chrome device emulation, not physical iOS/Android hardware; other browser engines are not certified. Underpromotion uses the local seed fixture; separate deployment evidence identifies common cases rerun with native Stockfish. Puzzle boards retain tap controls. Server clock/network latency rules are unchanged.
