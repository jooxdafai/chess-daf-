import chess
from backend.app import create_app
from tests.test_foundation import HEADERS

def test_catalog_and_multi_step_private_progress(tmp_path):
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'lib.sqlite')})
    c=app.test_client()
    page=c.get('/api/library?level=1',headers=HEADERS)
    assert page.status_code==200
    assert page.json['total']==2000 and len(page.json['items'])==20
    item=page.json['items'][0];pid=item['id']
    assert 'moves' not in item and 'solution' not in item
    hint=c.post(f'/api/library/{pid}/hint',json={},headers=HEADERS).json
    assert 'uci' not in hint and hint['stage']==1
    hint=c.post(f'/api/library/{pid}/hint',json={},headers=HEADERS).json
    assert 'from' in hint
    hint=c.post(f'/api/library/{pid}/hint',json={},headers=HEADERS).json
    from backend.catalog import catalog
    p=catalog()[pid];line=p['moves'];board=chess.Board(p['fen'])
    wrong=next((m.uci() for m in board.legal_moves if m.uci()!=line[0] and not board.gives_check(m)),None)
    if wrong:
        result=c.post(f'/api/library/{pid}/attempt',json={'uci':wrong,'ply':0},headers=HEADERS).json
        assert not result['correct'] and len(result['explanation'])>30
    for ply in range(0,len(line),2):
        r=c.post(f'/api/library/{pid}/attempt',json={'uci':line[ply],'ply':ply},headers=HEADERS)
        assert r.status_code==200 and r.json['correct']
    assert r.json['solved'] and r.json['assisted']
    assert c.post(f'/api/library/{pid}/attempt',json={'uci':line[0],'ply':0},headers=HEADERS).status_code==400
    assert c.get('/api/library?level=1',headers=HEADERS).json['solved']==1
    for query in ['level=6','page=-1','page=abc']:
        assert c.get('/api/library?'+query,headers=HEADERS).status_code==400

def test_dataset_exact_unique_and_legal():
    from backend.catalog import catalog
    items=list(catalog().values())
    assert len(items)==10000
    assert len({p['fen'].split(' ')[0]+' '+p['fen'].split(' ')[1] for p in items})==10000
    for level in range(1,6):assert sum(p['level']==level for p in items)==2000
    for p in items:
        b=chess.Board(p['fen']);assert b.is_valid()
        assert 1<=len(p['moves'])<=15 and len(p['moves'])%2==1
        for uci in p['moves']:
            m=chess.Move.from_uci(uci);assert m in b.legal_moves;b.push(m)

def test_library_guards_and_owner_isolation(tmp_path):
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'public.sqlite'),'PUBLIC_ACCESS':True,'PUBLIC_ORIGIN':'http://localhost','GUEST_COOKIE_PATH':'/'})
    a=app.test_client();b=app.test_client();a.get('/');b.get('/')
    headers={'Origin':'http://localhost'}
    item=a.get('/api/library').json['items'][0];pid=item['id']
    assert a.post(f'/api/library/{pid}/hint',json={}).status_code==403
    a.post(f'/api/library/{pid}/hint',json={},headers=headers)
    assert a.get('/api/library').json['items'][0]['assisted']==1
    assert b.get('/api/library').json['items'][0]['assisted']==0
    assert a.post('/api/library/not-real/hint',json={},headers=headers).status_code==404
    from backend.catalog import catalog
    line=catalog()[pid]['moves']
    r=a.post(f'/api/library/{pid}/attempt',json={'uci':line[0],'ply':0},headers=headers)
    assert r.status_code==200
    assert a.post(f'/api/library/{pid}/attempt',json={'uci':line[0],'ply':0},headers=headers).status_code==400
    assert b.get('/api/library').json['items'][0]['ply']==0
    assert b.post(f'/api/library/{pid}/attempt',json={'uci':line[0],'ply':True},headers=headers).status_code==400

def test_solution_reveal_does_not_mark_solved(tmp_path):
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'reveal.sqlite')});c=app.test_client()
    p=c.get('/api/library',headers=HEADERS).json['items'][0]
    result=c.post(f"/api/library/{p['id']}/solution",json={},headers=HEADERS).json
    assert result['frames'] and all('fen_before' in f for f in result['frames'])
    assert c.get('/api/library',headers=HEADERS).json['solved']==0
    assert c.get('/api/library',headers=HEADERS).json['items'][0]['assisted']==1

def test_explanation_after_unassisted_solve_does_not_remove_credit(tmp_path):
    from backend.catalog import catalog
    app=create_app({'TESTING':True,'DATABASE':str(tmp_path/'credit.sqlite')});c=app.test_client()
    p=c.get('/api/library',headers=HEADERS).json['items'][0];pid=p['id']
    for ply in range(0,len(catalog()[pid]['moves']),2):
        r=c.post(f'/api/library/{pid}/attempt',json={'uci':catalog()[pid]['moves'][ply],'ply':ply},headers=HEADERS)
        assert r.json['correct']
    assert r.json['solved'] and not r.json['assisted']
    c.post(f'/api/library/{pid}/solution',json={},headers=HEADERS)
    assert c.get('/api/library',headers=HEADERS).json['assisted']==0

def test_alternative_mate_is_accepted_and_actual_board_retained(tmp_path,monkeypatch):
    import backend.catalog as module
    p={'id':'mate-test','fen':'7k/5Q2/6K1/8/8/8/8/8 w - - 0 1','moves':['f7g7'],'level':1,'rating':500,'themes':['mateIn1']}
    monkeypatch.setattr(module,'catalog',lambda:{p['id']:p})
    from backend.game import GameStore
    lib=module.Library(GameStore(tmp_path/'mate.sqlite'))
    result=lib.attempt('mate-test','f7f8',0)
    assert result['solved'] and result['correct']
    assert chess.Board(result['fen']).is_checkmate()
    assert lib.list(1,0)['items'][0]['fen']==result['fen']
