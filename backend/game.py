"""Authoritative chess rules and durable, transactionally updated game records."""
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import chess


class GameStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, state TEXT NOT NULL)')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def read(self, db, game_id):
        row = db.execute('SELECT state FROM games WHERE id=?', (game_id,)).fetchone()
        if not row:
            raise KeyError(game_id)
        return json.loads(row[0])

    def write(self, db, game):
        db.execute('INSERT OR REPLACE INTO games VALUES (?,?)', (game['id'], json.dumps(game)))

    @staticmethod
    def board(game):
        board = chess.Board(game['start_fen'])
        for move in game['moves']:
            board.push_uci(move['uci'])
        return board

    @staticmethod
    def view(game):
        board = GameStore.board(game)
        outcome = board.outcome(claim_draw=True)
        return {**game, 'fen': board.fen(), 'ply': len(game['moves']),
                'turn': 'white' if board.turn else 'black', 'check': board.is_check(),
                'legal_moves': [m.uci() for m in board.legal_moves] if not game['result'] else [],
                'result': game['result'] or (outcome.result() if outcome else None),
                'reason': game['reason'] or (outcome.termination.name.lower() if outcome else None)}

    def create(self, fen=chess.STARTING_FEN, **settings):
        board = chess.Board(fen)
        if not board.is_valid():
            raise ValueError('وضع الرقعة غير صالح')
        game = {'id': str(uuid.uuid4()), 'created_at': time.time(), 'start_fen': fen,
                'moves': [], 'result': None, 'reason': None, 'settings': settings}
        with self.connection() as db:
            if db.execute('SELECT count(*) FROM games').fetchone()[0] >= 2000:
                raise ValueError('وصل سجل المباريات للحد الأقصى؛ صدّر نسخة وراجع مسؤول النظام')
            self.write(db, game)
        return self.view(game)

    def get(self, game_id):
        with self.connection() as db:
            return self.view(self.read(db, game_id))

    def list(self):
        with self.connection() as db:
            rows = db.execute('SELECT state FROM games ORDER BY rowid DESC LIMIT 100').fetchall()
            return [self.view(json.loads(row[0])) for row in rows]

    def move(self, game_id, uci, ply):
        with self.connection() as db:
            game = self.read(db, game_id)
            if type(ply) is not int or ply != len(game['moves']):
                raise ValueError('الموقف تغيّر؛ حدّث الرقعة وحاول تاني')
            board = self.board(game)
            if game['result'] or board.is_game_over(claim_draw=True):
                raise ValueError('المباراة انتهت')
            if not isinstance(uci, str) or len(uci) not in (4, 5):
                raise ValueError('نقلة غير صالحة')
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                raise ValueError('النقلة دي مش قانونية')
            san = board.san(move)
            board.push(move)
            game['moves'].append({'uci': uci, 'san': san, 'fen': board.fen()})
            outcome = board.outcome(claim_draw=True)
            if outcome:
                game.update(result=outcome.result(), reason=outcome.termination.name.lower())
            self.write(db, game)
            return self.view(game)
