"""Authoritative chess rules and durable, transactionally updated game records."""
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import chess


class StorageFull(Exception):
    pass


class GameStore:
    def __init__(self, path, now=time.time, owner='owner', guest_limit=1000):
        self.now = now
        self.owner = owner
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('BEGIN IMMEDIATE')
            db.execute('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, state TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS reviews (game_id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            if 'owner' not in [row[1] for row in db.execute('PRAGMA table_info(games)')]:
                db.execute("ALTER TABLE games ADD COLUMN owner TEXT NOT NULL DEFAULT 'owner'")
            db.execute('CREATE INDEX IF NOT EXISTS games_owner ON games(owner)')
            db.execute('CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY)')
            if owner!='owner' and not db.execute('SELECT 1 FROM guests WHERE id=?',(owner,)).fetchone():
                if db.execute('SELECT count(*) FROM guests').fetchone()[0]>=guest_limit:
                    raise StorageFull()
                db.execute('INSERT INTO guests VALUES (?)',(owner,))

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
        row = db.execute('SELECT state FROM games WHERE id=? AND owner=?', (game_id,self.owner)).fetchone()
        if not row:
            raise KeyError(game_id)
        return json.loads(row[0])

    def write(self, db, game):
        db.execute('INSERT OR REPLACE INTO games (id,state,owner) VALUES (?,?,?)', (game['id'],json.dumps(game),self.owner))

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

    def tick(self, game, board):
        clocks = game.get('clocks')
        if not clocks or game['result']:
            return
        side = 'white' if board.turn else 'black'
        now = self.now()
        clocks[side] = max(0, clocks[side] - max(0, now-game['clock_at']))
        game['clock_at'] = now
        if clocks[side] <= 0:
            winner = not board.turn
            result = '1/2-1/2' if board.has_insufficient_material(winner) else ('1-0' if winner else '0-1')
            game.update(result=result, reason='timeout')

    def create(self, fen=chess.STARTING_FEN, **settings):
        settings = {'mode':'local', 'color':'white', 'seconds':0, 'level':1, **settings}
        if (settings['mode'] not in ('local','training','match') or settings['color'] not in ('white','black')
                or type(settings['seconds']) is not int or settings['seconds'] not in (0,60,180,600)
                or type(settings['level']) is not int or settings['level'] not in range(1,6)):
            raise ValueError('إعدادات الماتش غير صالحة')
        board = chess.Board(fen)
        if not board.is_valid():
            raise ValueError('وضع الرقعة غير صالح')
        now = self.now()
        game = {'id': str(uuid.uuid4()), 'created_at': now, 'start_fen': fen,
                'moves': [], 'result': None, 'reason': None, 'settings': settings,
                'clocks': {'white':float(settings['seconds']), 'black':float(settings['seconds'])} if settings['seconds'] else None,
                'clock_at':now}
        with self.connection() as db:
            if db.execute('SELECT count(*) FROM games').fetchone()[0] >= 2000:
                raise ValueError('وصل سجل المباريات للحد الأقصى؛ صدّر نسخة وراجع مسؤول النظام')
            self.write(db, game)
        return self.view(game)

    def get(self, game_id):
        with self.connection() as db:
            game = self.read(db, game_id)
            self.tick(game, self.board(game))
            self.write(db, game)
            return self.view(game)

    def list(self):
        with self.connection() as db:
            rows = db.execute('SELECT state FROM games WHERE owner=? ORDER BY rowid DESC LIMIT 100',(self.owner,)).fetchall()
            result = []
            for row in rows:
                game=json.loads(row[0])
                self.tick(game,self.board(game))
                self.write(db,game)
                result.append(self.view(game))
            return result

    def move(self, game_id, uci, ply, actor='human'):
        with self.connection() as db:
            game = self.read(db, game_id)
            if type(ply) is not int or ply != len(game['moves']):
                raise ValueError('الموقف تغيّر؛ حدّث الرقعة وحاول تاني')
            board = self.board(game)
            if game['result'] or board.is_game_over(claim_draw=True):
                raise ValueError('المباراة انتهت')
            self.tick(game, board)
            if game['result']:
                self.write(db,game)
                return self.view(game)
            if game['settings']['mode'] != 'local':
                human_turn = board.turn == (game['settings']['color']=='white')
                if human_turn != (actor=='human'):
                    raise ValueError('مش دورك دلوقتي')
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
            elif len(game['moves']) >= 600:
                game.update(result='1/2-1/2',reason='move_limit')
            self.write(db, game)
            return self.view(game)

    def resign(self, game_id):
        with self.connection() as db:
            game=self.read(db,game_id)
            self.tick(game,self.board(game))
            if not game['result']:
                game.update(result='0-1' if game['settings']['color']=='white' else '1-0', reason='resignation')
            self.write(db,game)
            return self.view(game)

    def review(self, game_id):
        with self.connection() as db:
            self.read(db,game_id)
            row=db.execute('SELECT data FROM reviews WHERE game_id=?',(game_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def save_review(self, game_id, review):
        with self.connection() as db:
            self.read(db,game_id)
            db.execute('INSERT OR REPLACE INTO reviews VALUES (?,?)',(game_id,json.dumps(review)))
