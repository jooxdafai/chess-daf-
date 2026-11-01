import pytest
import chess
import os
from pathlib import Path
from backend.engine import Engine, EngineBusy, EngineUnavailable
from backend.game import GameStore
from backend.app import create_app
from tests.test_foundation import HEADERS


def test_server_clock_times_out_after_restart(tmp_path):
    now = [1000.0]
    store = GameStore(tmp_path/'clock.sqlite', now=lambda:now[0])
    game = store.create(mode='match', seconds=60, color='white', level=1)
    now[0] += 3.5
    game = store.move(game['id'], 'e2e4', 0)
    assert game['clocks']['white'] == pytest.approx(56.5)
    now[0] += 61
    restarted = GameStore(store.path, now=lambda:now[0])
    game = restarted.get(game['id'])
    assert game['result'] == '1-0'
    assert game['reason'] == 'timeout'
    assert game['clocks']['black'] == 0


def test_cannot_move_for_opponent_and_untimed_is_safe(tmp_path):
    store = GameStore(tmp_path/'clock.sqlite')
    game = store.create(mode='training', color='black', seconds=0, level=3)
    with pytest.raises(ValueError, match='دور'):
        store.move(game['id'], 'e2e4', 0)
    game = store.move(game['id'], 'e2e4', 0, actor='bot')
    assert game['ply'] == 1
    assert game['clocks'] is None


class LegalEngine:
    def play(self, board, level):
        return next(iter(board.legal_moves)).uci()

    def best(self, board):
        return {'uci':next(iter(board.legal_moves)).uci(), 'cp':20, 'depth':8}


def test_engine_endpoints_and_training_only_hints(tmp_path):
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'api.sqlite'),'ENGINE':LegalEngine()})
    client=app.test_client()
    game=client.post('/api/games',json={'mode':'match','seconds':60,'color':'white','level':1},headers=HEADERS).json
    assert client.post(f"/api/games/{game['id']}/hint",json={},headers=HEADERS).status_code == 400
    game=client.post(f"/api/games/{game['id']}/move",json={'uci':'e2e4','ply':0},headers=HEADERS).json
    game=client.post(f"/api/games/{game['id']}/bot",json={},headers=HEADERS).json
    assert game['ply']==2
    assert client.post(f"/api/games/{game['id']}/bot",json={},headers=HEADERS).status_code==400
    result=client.post(f"/api/games/{game['id']}/resign",json={},headers=HEADERS).json
    assert result['result']=='0-1'


@pytest.mark.parametrize('settings',[{'seconds':-1},{'seconds':9999999},{'level':6},{'color':'red'},{'mode':'admin'},{'seconds':True}])
def test_settings_are_bounded(tmp_path, settings):
    client=create_app({'TESTING':True,'DATABASE':str(tmp_path/'api.sqlite')}).test_client()
    assert client.post('/api/games',json=settings,headers=HEADERS).status_code==400


def test_engine_is_fail_closed_and_single_job():
    engine=Engine()
    engine.path='/definitely-not-a-stockfish-binary'
    with pytest.raises(EngineUnavailable):
        engine.play(chess.Board(),1)
    engine.path=__file__
    engine.lock.acquire()
    try:
        with pytest.raises(EngineBusy):
            engine.play(chess.Board(),1)
    finally:
        engine.lock.release()


@pytest.mark.skipif(not Path(os.environ.get('STOCKFISH_PATH','/usr/games/stockfish')).is_file(), reason='native Stockfish integration runs on Linux server')
def test_real_stockfish_returns_legal_move_and_analysis():
    engine=Engine()
    board=chess.Board()
    assert chess.Move.from_uci(engine.play(board,1)) in board.legal_moves
    assert chess.Move.from_uci(engine.play(board,3)) in board.legal_moves
    answer=engine.best(board)
    assert chess.Move.from_uci(answer['uci']) in board.legal_moves
    assert isinstance(answer['cp'],int)
    from backend.game import GameStore
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as tmp:
        store=GameStore(Path(tmp)/'real.sqlite')
        game=store.create()
        for i,uci in enumerate(['f2f3','e7e5','g2g4','d8h4']):
            game=store.move(game['id'],uci,i)
        review=engine.review(game)
        assert len(review['moves'])==4
        assert review['moves'][3]['best_san']=='Qh4#'
