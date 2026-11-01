import random
import pytest
import chess
from backend.engine import Engine
from backend.app import create_app
from tests.test_foundation import HEADERS
from tests.test_engine_clock import LegalEngine


def test_new_games_start_at_beginner_without_changing_explicit_difficulty(tmp_path):
    client=create_app({'TESTING':True,'DATABASE':str(tmp_path/'default.sqlite')}).test_client()
    assert client.post('/api/games',json={},headers=HEADERS).json['settings']['level']==1
    assert client.post('/api/games',json={'level':4},headers=HEADERS).json['settings']['level']==4


def test_export_names_the_actual_opponent_policy(tmp_path):
    client=create_app({'TESTING':True,'DATABASE':str(tmp_path/'export.sqlite')}).test_client()
    for level,opponent in [(1,'Practice opponent'),(3,'Stockfish')]:
        for color in ['white','black']:
            game=client.post('/api/games',json={'level':level,'color':color},headers=HEADERS).json
            pgn=client.get(f"/api/games/{game['id']}/pgn",headers=HEADERS).get_data(as_text=True)
            assert f'[{"Black" if color=="white" else "White"} "{opponent}"]' in pgn


def test_beginner_policy_is_fallible_and_does_not_change_the_board():
    from backend.training import choose_training_move
    board=chess.Board('7k/8/8/8/3p4/4Q3/8/K7 b - - 0 1');before=board.fen()
    move=choose_training_move(board,1,random.Random(0))
    assert move in board.legal_moves
    assert move!=chess.Move.from_uci('d4e3'),'the starter should not always find the best material gain'
    assert choose_training_move(board,2,random.Random(0))==chess.Move.from_uci('d4e3')
    assert choose_training_move(board,1,random.Random(1))==chess.Move.from_uci('d4e3')
    assert board.fen()==before


def test_easy_move_releases_the_slot_without_starting_a_stronger_native_search(monkeypatch):
    engine=Engine();engine.path=__file__
    def forbidden(*args,**kwargs):raise AssertionError('easy play must not run a deep Stockfish job')
    monkeypatch.setattr(chess.engine.SimpleEngine,'popen_uci',forbidden)
    board=chess.Board()
    assert chess.Move.from_uci(engine.play(board,1)) in board.legal_moves
    assert engine.lock.acquire(blocking=False);engine.lock.release()


def test_waiting_before_bot_request_charges_only_the_bot_clock(tmp_path):
    now=[1000.0]
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'pace.sqlite'),'ENGINE':LegalEngine()})
    app.extensions['games'].now=lambda:now[0]
    client=app.test_client();game=client.post('/api/games',json={'seconds':60},headers=HEADERS).json
    url=f"/api/games/{game['id']}"
    client.post(url+'/move',json={'uci':'e2e4','ply':0},headers=HEADERS)
    now[0]+=1.2
    result=client.post(url+'/bot',json={},headers=HEADERS).json
    assert result['clocks']['white']==60
    assert result['clocks']['black']==pytest.approx(58.8)
    assert result['ply']==2 and result['turn']=='white'


def test_practice_policy_handles_a_forced_move_and_end_of_game():
    from backend.training import choose_training_move
    board=chess.Board('7k/8/5K2/6Q1/8/8/8/8 b - - 0 1')
    assert list(board.legal_moves)==[chess.Move.from_uci('h8h7')]
    assert choose_training_move(board,1)==chess.Move.from_uci('h8h7')
    board=chess.Board()
    for uci in ['f2f3','e7e5','g2g4','d8h4']:
        board.push_uci(uci)
    with pytest.raises(ValueError):choose_training_move(board,1)
