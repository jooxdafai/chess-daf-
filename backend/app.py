import os
import chess
import chess.pgn
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .game import GameStore
from .engine import Engine, EngineBusy, EngineUnavailable
from .coach import explain_move
from .learning import Learning

ROOT = Path(__file__).resolve().parent.parent


def create_app(config=None):
    app = Flask(__name__, static_folder=str(ROOT/'web/static'), static_url_path='/static')
    app.config.update(DATABASE=os.environ.get('CHESS_DATABASE', str(ROOT/'data/chess.sqlite')),
                      PUBLIC_ORIGIN=os.environ.get('CHESS_ORIGIN', 'https://jooflow.space'),
                      MAX_CONTENT_LENGTH=16384)
    app.config.update(config or {})
    store = GameStore(app.config['DATABASE'])
    app.extensions['games'] = store
    engine = app.config.get('ENGINE') or Engine()
    app.extensions['engine'] = engine
    learning=Learning(store)
    app.extensions['learning']=learning

    @app.before_request
    def guard():
        if request.path == '/health':
            return
        if request.headers.get('X-Chess-User') != 'owner':
            abort(401)
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('Origin') != app.config['PUBLIC_ORIGIN']:
                abort(403)
            if not request.is_json:
                abort(415)
            if not isinstance(request.get_json(), dict):
                abort(400)

    @app.after_request
    def headers(response):
        response.headers.update({
            'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
            'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        })
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error='تعذّر تنفيذ الطلب', status=error.code), error.code

    @app.errorhandler(ValueError)
    def bad_move(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(KeyError)
    def not_found(error):
        return jsonify(error='المباراة مش موجودة'), 404

    @app.errorhandler(EngineBusy)
    def engine_busy(error):
        return jsonify(error='المحرك مشغول بتحليل تاني؛ جرّب كمان لحظة'), 429

    @app.errorhandler(EngineUnavailable)
    def engine_unavailable(error):
        return jsonify(error='محرك الشطرنج مش متاح حاليًا؛ الماتش محفوظ'), 503

    @app.get('/health')
    def health():
        return jsonify(status='ok', app='chess-daf')

    @app.get('/')
    def index():
        return send_from_directory(ROOT/'web', 'index.html')

    @app.get('/api/games')
    def games():
        return jsonify(store.list())

    @app.post('/api/games')
    def create():
        settings=request.json
        if set(settings)-{'mode','color','level','seconds'} or settings.get('mode')=='local':
            abort(400)
        return jsonify(store.create(**{'mode':'training', **settings}))

    @app.get('/api/games/<uuid:game_id>')
    def game(game_id):
        return jsonify(store.get(str(game_id)))

    @app.post('/api/games/<uuid:game_id>/move')
    def move(game_id):
        return jsonify(store.move(str(game_id), request.json.get('uci'), request.json.get('ply')))

    @app.post('/api/games/<uuid:game_id>/bot')
    def bot(game_id):
        game=store.get(str(game_id))
        if game['result']:
            return jsonify(game)
        if game['turn']==game['settings']['color'] or game['settings']['mode']=='local':
            raise ValueError('مش دور المحرك')
        uci=engine.play(store.board(game),game['settings']['level'])
        return jsonify(store.move(str(game_id),uci,game['ply'],actor='bot'))

    @app.post('/api/games/<uuid:game_id>/hint')
    def hint(game_id):
        game=store.get(str(game_id))
        if game['settings']['mode']!='training' or game['result'] or game['turn']!=game['settings']['color']:
            raise ValueError('التلميح متاح في دورك بوضع التدريب بس')
        answer=engine.best(store.board(game))
        board=store.board(game)
        suggested=chess.Move.from_uci(answer['uci'])
        explanation,concept=explain_move(board,suggested)
        return jsonify({**answer,'san':board.san(suggested),'explanation':explanation,'concept':concept})

    @app.post('/api/games/<uuid:game_id>/resign')
    def resign(game_id):
        return jsonify(store.resign(str(game_id)))

    @app.post('/api/games/<uuid:game_id>/review')
    def review(game_id):
        game_id=str(game_id)
        game=store.get(game_id)
        if not game['result']:
            raise ValueError('المراجعة الكاملة بعد الماتش؛ التلميحات متاحة في وضع التدريب')
        cached=store.review(game_id)
        if cached is not None:
            learning.from_review(game_id,cached)
            return jsonify(cached)
        result=engine.review(game)
        store.save_review(game_id,result)
        learning.from_review(game_id,result)
        return jsonify(result)

    @app.get('/api/practice')
    def practice():
        return jsonify(learning.list())

    @app.post('/api/practice/<puzzle_id>/attempt')
    def attempt(puzzle_id):
        return jsonify(learning.attempt(puzzle_id,request.json.get('uci')))

    @app.post('/api/practice/<puzzle_id>/hint')
    def puzzle_hint(puzzle_id):
        return jsonify(learning.hint(puzzle_id))

    @app.get('/api/progress')
    def progress():
        return jsonify(learning.progress())

    @app.get('/api/games/<uuid:game_id>/pgn')
    def pgn(game_id):
        game=store.get(str(game_id))
        exported=chess.pgn.Game.from_board(store.board(game))
        exported.headers.update(Event='Chess DAF', White='Joo' if game['settings']['color']=='white' else 'Stockfish',
                                Black='Joo' if game['settings']['color']=='black' else 'Stockfish',
                                Date=datetime.fromtimestamp(game['created_at'],timezone.utc).strftime('%Y.%m.%d'),
                                Result=game['result'] or '*')
        return Response(str(exported)+'\n',mimetype='application/x-chess-pgn',
                        headers={'Content-Disposition':f'attachment; filename="chess-daf-{game_id}.pgn"'})

    return app
