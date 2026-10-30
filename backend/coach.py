"""Short Arabic lessons tied to verified chess facts, not invented tactics."""
import math
import chess

NAMES={chess.PAWN:'البيدق',chess.KNIGHT:'الحصان',chess.BISHOP:'الفيل',chess.ROOK:'الرخ',chess.QUEEN:'الوزير',chess.KING:'الملك'}
LABELS={'best':'أفضل اختيار','good':'نقلة كويسة','inaccuracy':'عدم دقة','mistake':'غلطة','blunder':'غلطة كبيرة'}


def classify(loss):
    if loss>250: return 'blunder'
    if loss>100: return 'mistake'
    if loss>35: return 'inaccuracy'
    return 'good'


def explain_move(board, move):
    piece=board.piece_at(move.from_square)
    after=board.copy()
    after.push(move)
    square=chess.square_name(move.to_square)
    if after.is_checkmate():
        return f'النقلة إلى {square} بتعمل كش مات: الملك ملوش أي رد قانوني ينقذه.', 'checkmate'
    if board.is_castling(move):
        return 'التبييت بيحرّك الملك والرخ مع بعض: خطوة لتأمين الملك وتوصيل الرخ باللعب.', 'king_safety'
    if board.is_capture(move):
        captured=chess.PAWN if board.is_en_passant(move) else board.piece_type_at(move.to_square)
        return f'{NAMES[piece.piece_type]} بياخد {NAMES[captured]} على {square}. بص على تكملة المحرك قبل ما تحكم على التبادل.', 'capture'
    if after.is_check():
        return f'{NAMES[piece.piece_type]} إلى {square} بيعمل كش. الخصم لازم يرد على تهديد الملك في النقلة الجاية.', 'check'
    if piece.piece_type in (chess.KNIGHT,chess.BISHOP) and chess.square_rank(move.from_square) in (0,7):
        return f'تطوير {NAMES[piece.piece_type]} إلى {square} بيطلّعه من الصف الخلفي ويضيفه للّعب. راقب رد الخصم في التكملة.', 'development'
    if piece.piece_type==chess.PAWN and chess.square_file(move.to_square) in (3,4):
        return f'تحريك البيدق إلى {square} بيغيّر السيطرة على الوسط. قارن مربعاته المحمية قبل النقلة وبعدها.', 'center'
    return f'المحرك بيقترح {NAMES[piece.piece_type]} إلى {square}. اتبع التكملة المعروضة وشوف رد الخصم؛ التقييم السريع تقديري.', 'calculation'


def continuation(board, pv):
    result=[]
    board=board.copy()
    for uci in pv[:5]:
        move=chess.Move.from_uci(uci)
        if move not in board.legal_moves: break
        result.append(board.san(move))
        board.push(move)
    return result


def visual_frame(board, move):
    """One legal, self-contained animation step, never a speculative board."""
    if move not in board.legal_moves:
        raise ValueError('نقلة المراجعة غير قانونية')
    after=board.copy();after.push(move)
    explanation,concept=explain_move(board,move)
    return {'uci':move.uci(),'san':board.san(move),'fen_before':board.fen(),
            'fen':after.fen(),'explanation':explanation,'concept':concept}


def add_visual_review(game, review):
    """Upgrade cached text reviews without another engine job or score changes."""
    board=chess.Board(game['start_fen']);records=[]
    for played,record in zip(game['moves'],review['moves']):
        actual=chess.Move.from_uci(played['uci']);frames=[]
        try:
            best=chess.Move.from_uci(record['best_uci'])
        except (ValueError,TypeError):
            best=None
        if best in board.legal_moves:
            line_board=board.copy()
            for san in record.get('line',[])[:5]:
                try:
                    move=line_board.parse_san(san)
                except (ValueError,TypeError):
                    break
                if not frames and move!=best:break
                frames.append(visual_frame(line_board,move));line_board.push(move)
            if not frames:frames=[visual_frame(board,best)]
        records.append({**record,'fen_before':board.fen(),'played_frame':visual_frame(board,actual),
                        'best_frames':frames})
        board.push(actual)
    return {**review,'visual_version':1,'moves':records}


def build_review(game, positions):
    board=chess.Board(game['start_fen'])
    records=[]
    summary={label:0 for label in LABELS}
    accuracies=[]
    for index, played in enumerate(game['moves']):
        before,after=positions[index:index+2]
        side='white' if board.turn else 'black'
        loss=max(0,(before['cp']-after['cp'])*(1 if board.turn else -1))
        best=chess.Move.from_uci(before['uci'])
        quality='best' if played['uci']==before['uci'] else classify(loss)
        explanation,concept=explain_move(board,best)
        best_board=board.copy();best_board.push(best)
        records.append({'ply':index,'side':side,'uci':played['uci'],'san':played['san'],
                        'fen_before':board.fen(),'best_uci':before['uci'],'best_san':board.san(best),
                        'best_fen':best_board.fen(),'cp_before':before['cp'],'cp_after':after['cp'],
                        'loss':loss,'quality':quality,'label':LABELS[quality],'explanation':explanation,
                        'concept':concept,'depth':before['depth'],'line':continuation(board,before.get('pv',[]))})
        if side==game['settings']['color']:
            summary[quality]+=1
            accuracies.append(100*math.exp(-loss/300))
        board.push_uci(played['uci'])
    return add_visual_review(game,{'moves':records,'summary':summary,'accuracy':round(sum(accuracies)/len(accuracies)) if accuracies else None,
            'method':'Stockfish quick analysis; centipawn-loss estimate, not Chess.com accuracy'})
