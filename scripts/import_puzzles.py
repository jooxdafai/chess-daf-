"""Build a fixed CC0 Lichess subset. Tooling-only dependency: zstandard.
Run with project Python plus zstandard on PYTHONPATH. Network only at build time.
"""
import csv,io,json,hashlib,urllib.request
from pathlib import Path
from collections import Counter
import chess
import zstandard
URL='https://database.lichess.org/lichess_db_puzzle.csv.zst'
TARGET=Path(__file__).resolve().parents[1]/'assets/puzzles.json'
counts=Counter();items=[];seen=set()
with urllib.request.urlopen(URL,timeout=60) as response:
    with zstandard.ZstdDecompressor().stream_reader(response) as stream:
        for row in csv.DictReader(io.TextIOWrapper(stream)):
            rating=int(row['Rating']);level=1 if rating<1000 else 2 if rating<1400 else 3 if rating<1800 else 4 if rating<2200 else 5
            if counts[level]>=2000 or int(row['Popularity'])<80 or int(row['NbPlays'])<100:continue
            moves=row['Moves'].split()
            if not 2<=len(moves)<=16:continue
            board=chess.Board(row['FEN'])
            try:
                board.push_uci(moves[0]);fen=board.fen();key=' '.join(fen.split()[:2])
                if key in seen or not board.is_valid():continue
                for move in moves[1:]:board.push_uci(move)
            except ValueError:continue
            seen.add(key);counts[level]+=1
            items.append(dict(id=row['PuzzleId'],fen=fen,moves=moves[1:],rating=rating,level=level,themes=row['Themes'].split()))
            if len(items)%1000==0:print(len(items),dict(counts),flush=True)
            if len(items)==10000:break
assert len(items)==10000 and all(counts[i]==2000 for i in range(1,6))
TARGET.write_text(json.dumps(items,separators=(',',':'))+'\n')
manifest={'source':URL,'license':'CC0-1.0','count':len(items),'levels':dict(counts),'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'selection':'First unique legal positions in stream; popularity>=80, plays>=100, max15 solution plies. Rating bands <1000/1400/1800/2200/else. Frozen snapshot, not a representative random sample.'}
TARGET.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
