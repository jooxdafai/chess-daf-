import chess
import pytest
from backend.game import GameStore
from backend.learning import Learning
from backend.app import create_app
from tests.test_foundation import HEADERS


def test_puzzles_hide_answers_and_cannot_farm_solved_count(tmp_path):
    store=GameStore(tmp_path/'learn.sqlite')
    learning=Learning(store)
    puzzles=learning.list()
    puzzle=next(p for p in puzzles if p['id']=='starter-capture')
    assert 'best_uci' not in puzzle
    assert 'explanation' not in puzzle
    wrong=learning.attempt(puzzle['id'],'a1b1')
    assert not wrong['correct']
    right=learning.attempt(puzzle['id'],'d2e3')
    assert right['correct']
    learning.attempt(puzzle['id'],'d2e3')
    assert learning.progress()['solved']==1
    assert learning.progress()['attempts']==2
    assert Learning(GameStore(store.path)).progress()['solved']==1


def test_reviews_create_only_players_mistake_exercises_once(tmp_path):
    store=GameStore(tmp_path/'learn.sqlite')
    learning=Learning(store)
    game=store.create(mode='training',color='white')
    record={'ply':0,'side':'white','quality':'blunder','loss':400,'best_uci':'d2d4',
            'fen_before':chess.STARTING_FEN,'explanation':'سيطر على الوسط','concept':'center'}
    review={'moves':[record,{**record,'side':'black','ply':1}],'accuracy':40}
    store.save_review(game['id'],review)
    learning.from_review(game['id'],review)
    learning.from_review(game['id'],review)
    personal=[p for p in learning.list() if p['source']!='starter']
    assert len(personal)==1
    assert personal[0]['side']=='white'


def test_practice_api_origin_and_illegal_move(tmp_path):
    client=create_app({'TESTING':True,'DATABASE':str(tmp_path/'learn.sqlite')}).test_client()
    assert client.get('/api/practice').status_code==401
    assert client.get('/api/practice',headers=HEADERS).status_code==200
    assert client.post('/api/practice/starter-capture/attempt',json={'uci':'e2e5'},headers=HEADERS).status_code==400
    hinted=client.post('/api/practice/starter-capture/hint',json={},headers=HEADERS).json
    assert hinted['uci']=='d2e3'
    client.post('/api/practice/starter-capture/attempt',json={'uci':'d2e3'},headers=HEADERS)
    progress=client.get('/api/progress',headers=HEADERS).json
    assert progress['assisted']==1
    assert progress['solved']==1
