import os
import hashlib
import re
import secrets
import chess
import chess.pgn
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.local import LocalProxy

from .game import GameStore, StorageFull
from .engine import Engine, EngineBusy, EngineUnavailable
from .coach import explain_move, add_visual_review
from .learning import Learning
from .catalog import Library

ROOT = Path(__file__).resolve().parent.parent


def create_app(config=None):
    app = Flask(__name__, static_folder=str(ROOT/'web/static'), static_url_path='/static')
    app.config.update(DATABASE=os.environ.get('CHESS_DATABASE', str(ROOT/'data/chess.sqlite')),
                      PUBLIC_ORIGIN=os.environ.get('CHESS_ORIGIN', 'https://jooflow.space'),
                      PUBLIC_ACCESS=os.environ.get('CHESS_PUBLIC')=='1',
                      GUEST_COOKIE_PATH=os.environ.get('CHESS_COOKIE_PATH','/chess-daf/'),
                      MAX_GUESTS=1000,
                      MAX_CONTENT_LENGTH=16384)
    app.config.update(config or {})
    legacy_store = GameStore(app.config['DATABASE'])
    app.extensions['games'] = legacy_store
    engine = app.config.get('ENGINE') or Engine()
    app.extensions['engine'] = engine
    legacy_learning=Learning(legacy_store)
    app.extensions['learning']=legacy_learning
    store=LocalProxy(lambda:g.store)
    learning=LocalProxy(lambda:g.learning)

    @app.before_request
    def guard():
        if request.path == '/health':
            return
        if not app.config['PUBLIC_ACCESS'] and request.headers.get('X-Chess-User') != 'owner':
            abort(401)
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            if request.headers.get('Origin') != app.config['PUBLIC_ORIGIN']:
                abort(403)
            if not request.is_json:
                abort(415)
            if not isinstance(request.get_json(), dict):
                abort(400)
        if app.config['PUBLIC_ACCESS']:
            if request.path=='/' or request.path.startswith('/api/'):
                token=request.cookies.get('chess_daf_guest','')
                if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
                    token=secrets.token_urlsafe(32)
                    g.new_guest_cookie=token
                if request.path.startswith('/api/'):
                    owner=hashlib.sha256(token.encode()).hexdigest()
                    g.store=GameStore(app.config['DATABASE'],owner=owner,guest_limit=app.config['MAX_GUESTS'])
                    g.learning=Learning(g.store)
        else:
            g.store=legacy_store
            g.learning=legacy_learning

    @app.after_request
    def headers(response):
        if getattr(g,'new_guest_cookie',None):
            response.set_cookie('chess_daf_guest',g.new_guest_cookie,max_age=365*24*60*60,
                                httponly=True,secure=app.config['PUBLIC_ORIGIN'].startswith('https://'),
                                samesite='Lax',path=app.config['GUEST_COOKIE_PATH'])
        response.vary.add('Cookie')
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

    @app.errorhandler(StorageFull)
    def storage_full(error):
        return jsonify(error='الموقع وصل لحد الملفات المحفوظة حاليًا؛ جرّب لاحقًا'), 429

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
            if cached.get('visual_version')!=1:
                cached=add_visual_review(game,cached)
                store.save_review(game_id,cached)
            learning.from_review(game_id,cached)
            return jsonify(cached)
        result=engine.review(game)
        store.save_review(game_id,result)
        learning.from_review(game_id,result)
        return jsonify(result)

    @app.get('/api/library')
    def library_list():
        try:level=int(request.args.get('level','1'));page=int(request.args.get('page','0'))
        except ValueError:raise ValueError('المستوى أو الصفحة غير صالح') from None
        return jsonify(Library(store).list(level,page))

    @app.post('/api/library/<puzzle_id>/<action>')
    def library_action(puzzle_id,action):
        lib=Library(store)
        if action=='hint':return jsonify(lib.hint(puzzle_id))
        if action=='attempt':return jsonify(lib.attempt(puzzle_id,request.json.get('uci'),request.json.get('ply')))
        if action=='solution':return jsonify(lib.solution(puzzle_id))
        abort(404)

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
        opponent='Practice opponent' if game['settings']['level']<=2 else 'Stockfish'
        exported.headers.update(Event='Chess DAF', White='Joo' if game['settings']['color']=='white' else opponent,
                                Black='Joo' if game['settings']['color']=='black' else opponent,
                                Date=datetime.fromtimestamp(game['created_at'],timezone.utc).strftime('%Y.%m.%d'),
                                Result=game['result'] or '*')
        return Response(str(exported)+'\n',mimetype='application/x-chess-pgn',
                        headers={'Content-Disposition':f'attachment; filename="chess-daf-{game_id}.pgn"'})

    return app
