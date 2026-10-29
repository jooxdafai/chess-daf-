import json
import chess

CONCEPTS={'checkmate':'الكش مات','king_safety':'أمان الملك','capture':'حساب التبادلات',
          'check':'التهديد بالكش','development':'تطوير القطع','center':'السيطرة على الوسط','calculation':'حساب النقلات'}


class Learning:
    def __init__(self, store):
        self.store=store
        with store.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS puzzles (id TEXT PRIMARY KEY, data TEXT NOT NULL, solved INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, assisted INTEGER DEFAULT 0)')
            if 'owner' not in [row[1] for row in db.execute('PRAGMA table_info(puzzles)')]:
                db.execute("ALTER TABLE puzzles ADD COLUMN owner TEXT NOT NULL DEFAULT 'owner'")
            db.execute('CREATE INDEX IF NOT EXISTS puzzles_owner ON puzzles(owner)')
            for id,seq,uci,prompt in [
                ('starter-mate-black',['f2f3','e7e5','g2g4'],'d8h4','دور الأسود: تقدر تعمل كش مات في نقلة؟'),
                ('starter-mate-white',['e2e4','e7e5','f1c4','b8c6','d1h5','g8f6'],'h5f7','دور الأبيض: دور على كش مات في نقلة.')]:
                board=chess.Board()
                for move in seq: board.push_uci(move)
                self.insert(db,{'id':id,'source':'starter','fen':board.fen(),'side':'white' if board.turn else 'black',
                                'best_uci':uci,'prompt':prompt,'concept':'checkmate',
                                'explanation':'الوزير بيعمل كش مات: الملك ملوش هروب أو صد للكش أو طريقة ياخد القطعة المهاجمة.'})
            self.insert(db,{'id':'starter-capture','source':'starter','fen':'7k/8/8/8/8/4q3/3P4/K7 w - - 0 1',
                            'side':'white','best_uci':'d2e3','prompt':'دور الأبيض: الوزير الأسود متاح للأخذ. هتاخده بإيه؟',
                            'concept':'capture','explanation':'البيدق بياخد الوزير قطريًا من d2 إلى e3. البيدق بيتحرك لقدّام لكن بياخد على القطر.'})

    def insert(self,db,puzzle):
        db.execute('INSERT OR IGNORE INTO puzzles (id,data,owner) VALUES (?,?,?)',(self.key(puzzle['id']),json.dumps(puzzle),self.store.owner))

    def key(self,puzzle_id):
        return puzzle_id if self.store.owner=='owner' else f'{self.store.owner}:{puzzle_id}'

    def from_review(self,game_id,review):
        game=self.store.get(game_id)
        candidates=[m for m in review['moves'] if m['side']==game['settings']['color']
                    and m['quality'] in ('inaccuracy','mistake','blunder')]
        candidates.sort(key=lambda m:m['loss'],reverse=True)
        with self.store.connection() as db:
            for move in candidates[:5]:
                self.insert(db,{'id':f"{game_id}-{move['ply']}",'source':game_id,'fen':move['fen_before'],
                                'side':move['side'],'best_uci':move['best_uci'],'concept':move['concept'],
                                'explanation':move['explanation'],
                                'prompt':f"فرصة من ماتشك: أعد اختيار المحرك في النقلة {move['ply']//2+1}. ممكن توجد بدائل كويسة؛ التمرين هنا على اختيار المراجعة."})

    def list(self):
        with self.store.connection() as db:
            rows=db.execute('SELECT data,solved,attempts,assisted FROM puzzles WHERE owner=? ORDER BY solved ASC,rowid DESC LIMIT 50',(self.store.owner,)).fetchall()
        return [{**{k:v for k,v in json.loads(data).items() if k not in ('best_uci','explanation')},
                 'legal_moves':[move.uci() for move in chess.Board(json.loads(data)['fen']).legal_moves],
                 'solved':bool(solved),'attempts':attempts,'assisted':bool(assisted)} for data,solved,attempts,assisted in rows]

    def load(self,db,puzzle_id):
        row=db.execute('SELECT data,solved FROM puzzles WHERE id=? AND owner=?',(self.key(puzzle_id),self.store.owner)).fetchone()
        if not row: raise KeyError(puzzle_id)
        return json.loads(row[0]),row[1]

    def attempt(self,puzzle_id,uci):
        with self.store.connection() as db:
            puzzle,solved=self.load(db,puzzle_id)
            board=chess.Board(puzzle['fen'])
            if not isinstance(uci,str) or len(uci) not in (4,5):
                raise ValueError('نقلة غير صالحة')
            move=chess.Move.from_uci(uci)
            if move not in board.legal_moves: raise ValueError('النقلة دي مش قانونية؛ حاول تاني')
            correct=uci==puzzle['best_uci']
            if not solved:
                db.execute('UPDATE puzzles SET attempts=attempts+1,solved=? WHERE id=? AND owner=?',(int(correct),self.key(puzzle_id),self.store.owner))
            return {'correct':correct,'explanation':puzzle['explanation'] if correct else 'دي نقلة قانونية. جرّب اختيار التمرين، أو اطلب تلميح لو محتاج.'}

    def hint(self,puzzle_id):
        with self.store.connection() as db:
            puzzle,solved=self.load(db,puzzle_id)
            if not solved: db.execute('UPDATE puzzles SET assisted=1 WHERE id=? AND owner=?',(self.key(puzzle_id),self.store.owner))
            return {'uci':puzzle['best_uci'],'explanation':puzzle['explanation']}

    def progress(self):
        with self.store.connection() as db:
            solved,attempts,assisted=db.execute('SELECT coalesce(sum(solved),0),coalesce(sum(attempts),0),coalesce(sum(solved*assisted),0) FROM puzzles WHERE owner=?',(self.store.owner,)).fetchone()
            total,finished=db.execute("SELECT count(*),coalesce(sum(json_extract(state,'$.result') IS NOT NULL),0) FROM games WHERE owner=?",(self.store.owner,)).fetchone()
            reviews=[json.loads(row[0]) for row in db.execute('SELECT r.data FROM reviews r JOIN games g ON g.id=r.game_id WHERE g.owner=? ORDER BY r.rowid DESC LIMIT 12',(self.store.owner,)).fetchall()]
            weakest=db.execute("SELECT json_extract(data,'$.concept'),count(*) FROM puzzles WHERE owner=? AND solved=0 AND json_extract(data,'$.source')!='starter' GROUP BY json_extract(data,'$.concept') ORDER BY count(*) DESC LIMIT 3",(self.store.owner,)).fetchall()
        scores=[r['accuracy'] for r in reversed(reviews) if r['accuracy'] is not None]
        return {'games':total,'finished':finished,'reviewed':len(reviews),'solved':solved,'attempts':attempts,'assisted':assisted,
                'scores':scores,'average':round(sum(scores)/len(scores)) if scores else None,
                'focus':[CONCEPTS.get(concept,concept) for concept,count in weakest]}
