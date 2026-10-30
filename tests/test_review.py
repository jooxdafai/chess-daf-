import chess
import pytest
from backend.coach import build_review, explain_move, classify, add_visual_review
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


def test_review_has_verified_played_and_best_animation_frames():
    game={'start_fen':chess.STARTING_FEN,'settings':{'color':'white'},'moves':[{'uci':'e2e4','san':'e4'}]}
    positions=[{'cp':0,'uci':'d2d4','depth':8,'pv':['d2d4','d7d5','d2d3']},{'cp':0,'uci':'e7e5','depth':8,'pv':[]}]
    review=build_review(game,positions)
    assert review['visual_version']==1
    move=review['moves'][0]
    assert move['played_frame']['uci']=='e2e4'
    assert 'e4' in move['played_frame']['explanation']
    assert [f['uci'] for f in move['best_frames']]==['d2d4','d7d5']
    board=chess.Board()
    for frame in move['best_frames']:
        assert frame['fen_before']==board.fen()
        assert chess.Move.from_uci(frame['uci']) in board.legal_moves
        board.push_uci(frame['uci']);assert frame['fen']==board.fen()


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


def test_old_cached_reviews_gain_visual_frames_without_another_engine_job(tmp_path):
    engine=ReviewEngine();app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'old.sqlite'),'ENGINE':engine})
    client=app.test_client();game=client.post('/api/games',json={},headers=HEADERS).json
    url=f"/api/games/{game['id']}"
    client.post(url+'/move',json={'uci':'e2e4','ply':0},headers=HEADERS);client.post(url+'/resign',json={},headers=HEADERS)
    review=client.post(url+'/review',json={},headers=HEADERS).json
    review.pop('visual_version')
    for move in review['moves']:
        move.pop('played_frame');move.pop('best_frames')
    app.extensions['games'].save_review(game['id'],review)
    upgraded=client.post(url+'/review',json={},headers=HEADERS).json
    assert upgraded['visual_version']==1 and upgraded['moves'][0]['played_frame']['san']=='e4'
    assert upgraded['accuracy']==review['accuracy'] and engine.calls==1


@pytest.mark.parametrize('fen,uci,squares',[
    ('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1','e1g1',{'g1':'K','f1':'R','h1':None}),
    ('7k/P7/8/8/8/8/8/7K w - - 0 1','a7a8n',{'a8':'N','a7':None}),
    ('7k/8/8/3pP3/8/8/8/7K w - d6 0 1','e5d6',{'d6':'P','d5':None}),
])
def test_visual_frames_follow_special_move_rules(fen,uci,squares):
    board=chess.Board(fen);game={'start_fen':fen,'moves':[{'uci':uci,'san':board.san(chess.Move.from_uci(uci))}]}
    record={'best_uci':uci,'line':[]};review=add_visual_review(game,{'moves':[record]})
    for frame in [review['moves'][0]['played_frame'],*review['moves'][0]['best_frames']]:
        after=chess.Board(frame['fen'])
        for square,piece in squares.items():
            actual=after.piece_at(chess.parse_square(square));assert (actual.symbol() if actual else None)==piece


def test_cached_invalid_continuation_is_not_animated():
    game={'start_fen':chess.STARTING_FEN,'moves':[{'uci':'e2e4','san':'e4'}]}
    review=add_visual_review(game,{'moves':[{'best_uci':'d2d4','line':['d4','not a move']}]})
    assert [f['uci'] for f in review['moves'][0]['best_frames']]==['d2d4']
    review=add_visual_review(game,{'moves':[{'best_uci':'invalid','line':[]}]})
    assert review['moves'][0]['best_frames']==[]
