"""Shared immutable CC0 puzzles; sparse, owner-scoped learning state."""
import json
from functools import lru_cache
from pathlib import Path
import chess
from .coach import explain_move, visual_frame

THEMES={'fork':'شوكة: هدد قطعتين بنقلة واحدة','pin':'تثبيت قطعة بتحمي قطعة أغلى','skewer':'سيخ: هاجم القطعة الأمامية ثم اللي وراها','mate':'ابحث عن شبكة كش مات','hangingPiece':'فتّش عن قطعة من غير حماية','discoveredAttack':'حرّك قطعة واكشف هجوم اللي وراها','sacrifice':'احسب التضحية لآخر التكملة','promotion':'راقب فرصة ترقية البيدق','backRankMate':'راقب ضعف الصف الخلفي','deflection':'ابعد المدافع عن مهمته','attraction':'اجذب القطعة لمربع ضعيف','endgame':'احسب بدقة في نهاية اللعب'}
THEMES.update({'zugzwang':'فكرة الإجبار: دوّر على نقلة تخلي الخصم مضطر يضعّف موقفه','pawnEndgame':'نهاية بيادق: راقب مربعات دخول الملك وسباق الترقية','crushing':'ابحث عن تكملة تحافظ على التفوق الحاسم','advantage':'احسب تكملة تكسب أفضلية','doubleCheck':'الكش المزدوج بيجبر الملك يتحرك','removeDefender':'دور على طريقة تشيل المدافع','quietMove':'النقلة الهادية ممكن تصنع تهديد أقوى من الكش','intermezzo':'احسب النقلة البينية قبل الأخذ المتوقع','trappedPiece':'راقب القطعة اللي مربعات هروبها مقفولة','mateIn1':'دور على كش مات في نقلة','mateIn2':'احسب كش مات في نقلتين مع رد الخصم','mateIn3':'احسب شبكة مات في تلات نقلات'})
@lru_cache(maxsize=1)
def catalog():
    return {p['id']:p for p in json.loads((Path(__file__).resolve().parents[1]/'assets/puzzles.json').read_text())}

def idea(p):
    return ' · '.join(THEMES[t] for t in p['themes'] if t in THEMES) or 'قارن الكش والأخذ والتهديد، واحسب رد الخصم قبل الاختيار.'

class Library:
    def __init__(self,store):self.store=store
    def setup(self,db):
        db.execute('CREATE TABLE IF NOT EXISTS library_progress (owner TEXT NOT NULL, puzzle TEXT NOT NULL, ply INTEGER NOT NULL DEFAULT 0, solved INTEGER NOT NULL DEFAULT 0, assisted INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, final_fen TEXT, PRIMARY KEY(owner,puzzle))')
    def state(self,db,pid):
        self.setup(db)
        row=db.execute('SELECT ply,solved,assisted,hints,attempts,final_fen FROM library_progress WHERE owner=? AND puzzle=?',(self.store.owner,pid)).fetchone()
        return dict(zip(['ply','solved','assisted','hints','attempts','final_fen'],row or [0]*5+[None]))
    def save(self,db,pid,s):
        db.execute('INSERT OR REPLACE INTO library_progress VALUES (?,?,?,?,?,?,?,?)',(self.store.owner,pid,s['ply'],s['solved'],s['assisted'],s['hints'],s['attempts'],s.get('final_fen')))
    def load(self,pid):
        if pid not in catalog():raise KeyError(pid)
        return catalog()[pid]
    def board(self,p,s):
        b=chess.Board(p['fen'])
        for uci in p['moves'][:s['ply']]:b.push_uci(uci)
        return chess.Board(s['final_fen']) if s.get('final_fen') else b
    def view(self,p,s):
        b=self.board(p,s)
        return {**{k:p[k] for k in ('id','rating','level')},**s,'fen':b.fen(),'side':'white' if chess.Board(p['fen']).turn else 'black','legal_moves':[m.uci() for m in b.legal_moves] if not s['solved'] else [],'prompt':'دورك: اختار أقوى نقلة وكمل التكتيك.'}
    def list(self,level,page):
        if type(level)is not int or level not in range(1,6) or type(page)is not int or not 0<=page<100:raise ValueError('المستوى أو الصفحة غير صالح')
        items=[p for p in catalog().values() if p['level']==level]
        with self.store.connection() as db:
            self.setup(db)
            rows=db.execute('SELECT puzzle,ply,solved,assisted,hints,attempts,final_fen FROM library_progress WHERE owner=?',(self.store.owner,)).fetchall()
            states={r[0]:dict(zip(['ply','solved','assisted','hints','attempts','final_fen'],r[1:])) for r in rows}
            default=dict(ply=0,solved=0,assisted=0,hints=0,attempts=0)
            return {'total':len(items),'page':page,'solved':sum(r[2] for r in rows),'assisted':sum(r[2]*r[3] for r in rows),'items':[self.view(p,states.get(p['id'],default)) for p in items[page*20:page*20+20]]}
    def hint(self,pid):
        p=self.load(pid)
        with self.store.connection() as db:
            s=self.state(db,pid)
            if s['solved']:return {'stage':3,'explanation':'اللغز اتحل. اختار اللغز التالي.'}
            s['assisted']=1;s['hints']=min(3,s['hints']+1);self.save(db,pid,s)
            uci=p['moves'][s['ply']];result={'stage':s['hints'],'explanation':idea(p)}
            if s['hints']>=2:result['from']=uci[:2]
            if s['hints']==3:result['uci']=uci;result['explanation']=explain_move(self.board(p,s),chess.Move.from_uci(uci))[0]
            return result
    def attempt(self,pid,uci,ply):
        p=self.load(pid)
        with self.store.connection() as db:
            s=self.state(db,pid)
            if s['solved'] or type(ply)is not int or ply!=s['ply']:raise ValueError('الموقف تغيّر؛ افتح اللغز تاني')
            b=self.board(p,s)
            if not isinstance(uci,str) or len(uci) not in (4,5):raise ValueError('نقلة غير صالحة')
            move=chess.Move.from_uci(uci)
            if move not in b.legal_moves:raise ValueError('النقلة مش قانونية؛ ملكك لازم يفضل آمن')
            best=chess.Move.from_uci(p['moves'][s['ply']]);after=b.copy();after.push(move)
            correct=move==best or after.is_checkmate();s['attempts']+=1
            frames=[]
            if correct:
                frames.append(visual_frame(b,move));b.push(move);s['ply']+=1;s['hints']=0
                if s['ply']<len(p['moves']) and not b.is_checkmate():
                    reply=chess.Move.from_uci(p['moves'][s['ply']]);frames.append(visual_frame(b,reply));b.push(reply);s['ply']+=1
                s['solved']=int(s['ply']>=len(p['moves']) or b.is_checkmate())
                if s['solved']:s['final_fen']=b.fen()
                explanation=frames[0]['explanation']+' '+idea(p)+(' ممتاز، كملت حل اللغز.' if s['solved'] else ' الخصم رد؛ كمل الحساب.')
            else:
                s['assisted']=1
                explanation='اختيارك: '+explain_move(b,move)[0]+' لكن ده مش تكملة اللغز المعتمدة. الفكرة: '+idea(p)+' الاختيار المعتمد: '+explain_move(b,best)[0]+' جرّب تاني أو افتح شرح الحل.'
            self.save(db,pid,s)
            return {**self.view(p,s),'correct':correct,'explanation':explanation,'frames':frames,'suggested':None if correct else visual_frame(b,best)}
    def solution(self,pid):
        p=self.load(pid)
        with self.store.connection() as db:
            s=self.state(db,pid)
            if not s['solved']:s['assisted']=1
            self.save(db,pid,s)
        b=chess.Board(p['fen']);frames=[]
        for uci in p['moves']:
            move=chess.Move.from_uci(uci);frames.append(visual_frame(b,move));b.push(move)
        return {'frames':frames,'explanation':idea(p)}
