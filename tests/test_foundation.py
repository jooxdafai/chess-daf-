import pytest
import chess
from backend.app import create_app
from backend.game import GameStore


@pytest.fixture
def store(tmp_path):
    return GameStore(tmp_path / 'chess.sqlite')


def test_illegal_moves_are_rejected_without_changing_position(store):
    game = store.create()
    with pytest.raises(ValueError):
        store.move(game['id'], 'e2e5', 0)
    assert store.get(game['id'])['fen'] == chess.STARTING_FEN


def test_checkmate_and_persistence(store):
    game = store.create()
    for i, move in enumerate(['f2f3', 'e7e5', 'g2g4', 'd8h4']):
        game = store.move(game['id'], move, i)
    assert game['result'] == '0-1'
    assert game['reason'] == 'checkmate'
    assert GameStore(store.path).get(game['id'])['moves'][-1]['san'] == 'Qh4#'
    with pytest.raises(ValueError):
        store.move(game['id'], 'a2a3', 4)


def test_stale_move_cannot_be_applied_twice(store):
    game = store.create()
    store.move(game['id'], 'e2e4', 0)
    with pytest.raises(ValueError, match='تغيّر'):
        store.move(game['id'], 'e7e5', 0)


def test_rules_include_underpromotion_castling_and_en_passant(store):
    game = store.create(fen='7k/P7/8/8/8/8/8/7K w - - 0 1')
    assert 'a7a8n' in game['legal_moves']
    game = store.move(game['id'], 'a7a8n', 0)
    assert chess.Board(game['fen']).piece_at(chess.A8).piece_type == chess.KNIGHT
    game = store.create()
    seq = ['e2e4','a7a6','e4e5','d7d5','e5d6','e7d6','g1f3','b8c6','f1e2','g8f6','e1g1']
    for i, move in enumerate(seq):
        game = store.move(game['id'], move, i)
    board = chess.Board(game['fen'])
    assert board.piece_at(chess.F1).piece_type == chess.ROOK
    assert game['moves'][4]['san'] == 'exd6'


@pytest.fixture
def client(tmp_path):
    return create_app({'TESTING': True, 'DATABASE': str(tmp_path/'app.sqlite')}).test_client()


HEADERS = {'X-Chess-User': 'owner', 'Origin': 'https://jooflow.space'}


def test_private_api_requires_proxy_identity_and_origin(client):
    assert client.get('/api/games').status_code == 401
    assert client.post('/api/games', json={}, headers={'X-Chess-User':'owner'}).status_code == 403
    assert client.post('/api/games', json={}, headers={**HEADERS, 'Origin':'https://evil.test'}).status_code == 403
    assert client.post('/api/games', data='{}', headers=HEADERS).status_code == 415


def test_api_roundtrip_and_bounds(client):
    game = client.post('/api/games', json={}, headers=HEADERS).json
    assert client.post(f"/api/games/{game['id']}/move", json={'uci':'e2e4','ply':0}, headers=HEADERS).json['ply'] == 1
    assert client.get('/api/games/../../etc/passwd', headers=HEADERS).status_code == 404
    assert client.get('/api/games/not-an-id', headers=HEADERS).status_code == 404
    assert client.post('/api/games', json={'fen':'invalid'}, headers=HEADERS).status_code == 400
    assert client.get('/api/games', headers=HEADERS).json[0]['id'] == game['id']
