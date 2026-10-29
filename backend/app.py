import os
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .game import GameStore

ROOT = Path(__file__).resolve().parent.parent


def create_app(config=None):
    app = Flask(__name__, static_folder=str(ROOT/'web/static'), static_url_path='/static')
    app.config.update(DATABASE=os.environ.get('CHESS_DATABASE', str(ROOT/'data/chess.sqlite')),
                      PUBLIC_ORIGIN=os.environ.get('CHESS_ORIGIN', 'https://jooflow.space'),
                      MAX_CONTENT_LENGTH=16384)
    app.config.update(config or {})
    store = GameStore(app.config['DATABASE'])
    app.extensions['games'] = store

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
        if request.json:
            abort(400)
        return jsonify(store.create())

    @app.get('/api/games/<uuid:game_id>')
    def game(game_id):
        return jsonify(store.get(str(game_id)))

    @app.post('/api/games/<uuid:game_id>/move')
    def move(game_id):
        return jsonify(store.move(str(game_id), request.json.get('uci'), request.json.get('ply')))

    return app
