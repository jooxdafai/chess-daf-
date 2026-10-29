import pytest
import sqlite3
import json
import chess
from backend.app import create_app
from backend.game import GameStore
from tests.test_review import ReviewEngine

ORIGIN={'Origin':'https://jooflow.space'}


@pytest.fixture
def public_app(tmp_path):
    return create_app({'TESTING':True,'DATABASE':str(tmp_path/'public.sqlite'),
                       'PUBLIC_ACCESS':True,'ENGINE':ReviewEngine(),'GUEST_COOKIE_PATH':'/'})


def test_public_page_opens_without_gate_and_sets_private_browser_cookie(public_app):
    client=public_app.test_client()
    response=client.get('/')
    assert response.status_code==200
    assert 'Location' not in response.headers
    cookie=response.headers['Set-Cookie']
    assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=Lax' in cookie
    assert client.get('/api/games').json==[]
    assert 'Set-Cookie' not in client.get('/api/games').headers


def test_two_browsers_cannot_read_or_mutate_each_others_games(public_app):
    a,b=public_app.test_client(),public_app.test_client()
    a.get('/');b.get('/')
    game=a.post('/api/games',json={},headers=ORIGIN).json
    assert 'id' in game
    assert a.get('/api/games').json[0]['id']==game['id']
    assert b.get('/api/games',headers={'X-Chess-User':'owner'}).json==[]
    url=f"/api/games/{game['id']}"
    for path in [url,url+'/pgn']:
        assert b.get(path).status_code==404
    for endpoint,body in [('move',{'uci':'e2e4','ply':0}),('bot',{}),('hint',{}),('resign',{}),('review',{})]:
        assert b.post(url+'/'+endpoint,json=body,headers={**ORIGIN,'X-Chess-User':'owner'}).status_code==404
    assert a.post(url+'/move',json={'uci':'e2e4','ply':0},headers=ORIGIN).status_code==200


def test_practice_and_progress_are_browser_specific(public_app):
    a,b=public_app.test_client(),public_app.test_client()
    a.get('/');b.get('/')
    assert a.post('/api/practice/starter-capture/attempt',json={'uci':'d2e3'},headers=ORIGIN).json['correct']
    assert a.get('/api/progress').json['solved']==1
    assert b.get('/api/progress').json['solved']==0
    assert a.get('/api/practice').json!=b.get('/api/practice').json
    assert len(b.get('/api/practice').json)==3


def test_public_preserves_origin_and_cookie_boundaries(public_app):
    client=public_app.test_client()
    client.get('/')
    assert client.post('/api/games',json={}).status_code==403
    assert client.post('/api/games',json={},headers={'Origin':'https://evil.test'}).status_code==403
    client.set_cookie('chess_daf_guest','../../owner')
    response=client.get('/')
    assert response.status_code==200
    assert '../../owner' not in response.headers['Set-Cookie']


def test_old_owner_records_are_preserved_but_not_publicly_exposed(public_app):
    legacy=public_app.extensions['games']
    game=legacy.create()
    client=public_app.test_client();client.get('/')
    assert client.get('/api/games').json==[]
    assert client.get(f"/api/games/{game['id']}").status_code==404
    assert GameStore(legacy.path).get(game['id'])['id']==game['id']


def test_review_derived_exercises_are_not_cross_browser(public_app):
    a,b=public_app.test_client(),public_app.test_client()
    a.get('/');b.get('/')
    game=a.post('/api/games',json={},headers=ORIGIN).json
    a.post(f"/api/games/{game['id']}/move",json={'uci':'e2e4','ply':0},headers=ORIGIN)
    a.post(f"/api/games/{game['id']}/resign",json={},headers=ORIGIN)
    assert a.post(f"/api/games/{game['id']}/review",json={},headers=ORIGIN).status_code==200
    assert a.get('/api/progress').json['reviewed']==1
    assert b.get('/api/progress').json['reviewed']==0


def test_guest_profile_limit_bounds_storage_without_locking_existing_browser(public_app):
    public_app.config['MAX_GUESTS']=2
    a,b,c=public_app.test_client(),public_app.test_client(),public_app.test_client()
    assert a.get('/api/progress').status_code==200
    assert b.get('/api/progress').status_code==200
    assert c.get('/api/progress').status_code==429
    assert a.get('/api/progress').status_code==200


def test_old_sqlite_schema_migrates_without_reassigning_or_losing_records(tmp_path):
    path=tmp_path/'old-schema.sqlite'
    game_id='11111111-1111-4111-8111-111111111111'
    original=json.dumps({'id':game_id,'created_at':1000,'start_fen':chess.STARTING_FEN,
                         'moves':[],'result':None,'reason':None,'settings':{'mode':'local','color':'white','level':3,'seconds':0},
                         'clocks':None,'clock_at':1000})
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE games (id TEXT PRIMARY KEY,state TEXT NOT NULL)')
        db.execute('INSERT INTO games VALUES (?,?)',(game_id,original))
        db.execute('CREATE TABLE puzzles (id TEXT PRIMARY KEY,data TEXT NOT NULL,solved INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0,assisted INTEGER DEFAULT 0)')
    app=create_app({'TESTING':True,'DATABASE':str(path),'PUBLIC_ACCESS':True,'GUEST_COOKIE_PATH':'/'})
    client=app.test_client()
    assert client.get('/api/games').json==[]
    assert client.get(f'/api/games/{game_id}').status_code==404
    assert app.extensions['games'].get(game_id)['id']==game_id
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT owner,state FROM games WHERE id=?',(game_id,)).fetchone()==('owner',original)
