"""One bounded native Stockfish job at a time, never a user-selected executable."""
import os
import threading
from contextlib import contextmanager
from pathlib import Path

import chess.engine
from .coach import build_review


class EngineBusy(Exception):
    pass


class EngineUnavailable(Exception):
    pass


class Engine:
    def __init__(self):
        self.path=os.environ.get('STOCKFISH_PATH','/usr/games/stockfish')
        self.lock=threading.Lock()

    @contextmanager
    def session(self):
        if not Path(self.path).is_file():
            raise EngineUnavailable()
        if not self.lock.acquire(blocking=False):
            raise EngineBusy()
        try:
            with chess.engine.SimpleEngine.popen_uci([self.path], timeout=5) as engine:
                engine.configure({'Threads':1,'Hash':16})
                yield engine
        except (chess.engine.EngineError, TimeoutError, OSError):
            raise EngineUnavailable() from None
        finally:
            self.lock.release()

    def play(self, board, level):
        with self.session() as engine:
            engine.configure({'Skill Level':[0,3,8,14,20][level-1]})
            result=engine.play(board,chess.engine.Limit(time=.12 if level<4 else .3))
            return result.move.uci()

    def best(self, board):
        with self.session() as engine:
            info=engine.analyse(board,chess.engine.Limit(time=.2))
            return {'uci':info['pv'][0].uci(),'cp':info['score'].white().score(mate_score=10000),
                    'depth':info.get('depth',0)}

    def review(self, game):
        positions=[]
        board=chess.Board(game['start_fen'])
        with self.session() as engine:
            for index in range(len(game['moves'])+1):
                if board.is_game_over(claim_draw=True):
                    outcome=board.outcome(claim_draw=True)
                    positions.append({'cp':0 if outcome.winner is None else (10000 if outcome.winner else -10000),
                                      'uci':None,'depth':0,'pv':[]})
                else:
                    info=engine.analyse(board,chess.engine.Limit(time=.08))
                    positions.append({'cp':info['score'].white().score(mate_score=10000),
                                      'uci':info['pv'][0].uci(),'depth':info.get('depth',0),
                                      'pv':[m.uci() for m in info['pv'][:5]]})
                if index<len(game['moves']):
                    board.push_uci(game['moves'][index]['uci'])
        return build_review(game,positions)
