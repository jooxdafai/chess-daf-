import chess
import pytest
from backend.coach import build_review, explain_move, classify
from backend.app import create_app
from tests.test_foundation import HEADERS
from tests.test_engine_clock import LegalEngine


def test_quality_is_from_moving_players_perspective():
    assert classify(400)=='blunder'
    assert classify(150)=='mistake'
    assert classify(60)=='inaccuracy'
    assert classify(15)=='good'
    game={'start_fen':chess.STARTING_FEN,'settings':{'color':'black'},'moves':[{'uci':'e2e4','san':'e4'},{'uci':'e7e5','san':'e5'}]}
    positions=[{'cp':0,'uci':'d2d4','depth':8,'pv':['d2d4']},
               {'cp':200,'uci':'c7c5','depth':8,'pv':['c7c5']},
               {'cp':600,'uci':'g1f3','depth':8,'pv':['g1f3']}]
    review=build_review(game,positions)
    assert review['moves'][0]['loss']==0
    assert review['moves'][1]['loss']==400
    assert review['moves'][1]['quality']=='blunder'
    assert review['moves'][1]['best_san']=='c5'
    assert review['summary']['blunder']==1
    assert review['accuracy']<50


def test_explanations_are_grounded_in_position():
    board=chess.Board()
    text,concept=explain_move(board,chess.Move.from_uci('g1f3'))
    assert 'حصان' in text and 'f3' in text
    assert concept=='development'
    for move in ['f2f3','e7e5','g2g4']:
        board.push_uci(move)
    text,concept=explain_move(board,chess.Move.from_uci('d8h4'))
    assert 'مات' in text
    assert concept=='checkmate'


class ReviewEngine(LegalEngine):
    calls=0
    def review(self,game):
        self.calls+=1
        board=chess.Board(game['start_fen'])
        positions=[]
        for i in range(len(game['moves'])+1):
            positions.append({'cp':0,'uci':next(iter(board.legal_moves)).uci(),'depth':8,'pv':[]})
            if i<len(game['moves']): board.push_uci(game['moves'][i]['uci'])
        return build_review(game,positions)


def test_reviews_require_finished_game_and_are_cached(tmp_path):
    engine=ReviewEngine()
    client=create_app({'TESTING':True,'DATABASE':str(tmp_path/'review.sqlite'),'ENGINE':engine}).test_client()
    game=client.post('/api/games',json={},headers=HEADERS).json
    url=f"/api/games/{game['id']}"
    assert client.post(url+'/review',json={},headers=HEADERS).status_code==400
    client.post(url+'/move',json={'uci':'e2e4','ply':0},headers=HEADERS)
    client.post(url+'/resign',json={},headers=HEADERS)
    assert client.post(url+'/review',json={},headers=HEADERS).json['moves'][0]['san']=='e4'
    client.post(url+'/review',json={},headers=HEADERS)
    assert engine.calls==1
    assert client.get(url+'/pgn',headers=HEADERS).data.startswith(b'[Event "Chess DAF"]')
