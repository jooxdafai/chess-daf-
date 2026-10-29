"""Local-only deterministic engine/position fixtures for browser premove checks."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import chess
from flask import g, jsonify
from backend.app import create_app
from backend.coach import build_review
from tests.test_review import ReviewEngine


class PremoveEngine(ReviewEngine):
    def review(self,game):
        board=chess.Board(game['start_fen'])
        positions=[]
        for index in range(len(game['moves'])+1):
            best=next(iter(board.legal_moves),None)
            cp=(-10000 if board.turn else 10000) if board.is_checkmate() else 0
            positions.append({'cp':cp,'uci':best.uci() if best else None,'depth':8,'pv':[]})
            if index<len(game['moves']):board.push_uci(game['moves'][index]['uci'])
        return build_review(game,positions)

    def play(self,board,level):
        if board.turn==chess.BLACK and chess.Move.from_uci('d8h4') in board.legal_moves:
            after=board.copy();after.push_uci('d8h4')
            if after.is_checkmate():return 'd8h4'
        for ply,uci in [(1,'d7d5'),(3,'d8d5')]:
            move=chess.Move.from_uci(uci)
            if len(board.move_stack)==ply and move in board.legal_moves:
                return uci
        return next(iter(board.legal_moves)).uci()


if __name__=='__main__':
    app=create_app({'DATABASE':sys.argv[1],'PUBLIC_ACCESS':True,'GUEST_COOKIE_PATH':'/',
                    'ENGINE':PremoveEngine(),'PUBLIC_ORIGIN':'http://127.0.0.1:18972'})

    @app.post('/api/fixture/promotion')
    def promotion_fixture():
        return jsonify(g.store.create(fen='7k/P7/8/8/8/8/8/7K b - - 0 1',
                                      color='white',mode='match',seconds=0,level=1))

    @app.post('/api/fixture/mate')
    def mate_fixture():
        board=chess.Board()
        for move in ['f2f3','e7e5','g2g4']:board.push_uci(move)
        return jsonify(g.store.create(fen=board.fen(),color='white',mode='match',seconds=0,level=1))

    app.run(host='127.0.0.1',port=18972,threaded=True)
