"""Fallible, one-ply practice opponents. No Elo or human-strength claim."""
import random
import chess

VALUES={chess.PAWN:100,chess.KNIGHT:320,chess.BISHOP:330,chess.ROOK:500,chess.QUEEN:900,chess.KING:0}


def choose_training_move(board, level, rng=None):
    rng=rng or random.SystemRandom()
    moves=list(board.legal_moves)
    if not moves:raise ValueError('الموقف مفيهوش نقلة قانونية')
    side=board.turn
    def score(move):
        piece=board.piece_at(move.from_square)
        target=board.piece_type_at(move.to_square)
        gain=100 if board.is_en_passant(move) else VALUES.get(target,0)
        if move.promotion:gain+=VALUES[move.promotion]-100
        after=board.copy(stack=False);after.push(move)
        if after.is_checkmate():return 100000
        if piece.piece_type in (chess.KNIGHT,chess.BISHOP) and chess.square_rank(move.from_square)==(0 if side else 7):gain+=24
        if move.to_square in (chess.D4,chess.E4,chess.D5,chess.E5):gain+=14
        if piece.piece_type==chess.PAWN:gain+=6 if chess.square_file(move.to_square) in (3,4) else 1
        if board.is_castling(move):gain+=35
        if after.is_check():gain+=8
        if piece.piece_type==chess.KING and len(board.piece_map())>12 and not board.is_castling(move):gain-=20
        if after.is_attacked_by(not side,move.to_square):
            gain-=VALUES[move.promotion or piece.piece_type]*(.4 if level==1 else .8)*(.5 if after.is_attacked_by(side,move.to_square) else 1)
        return gain
    ranked=sorted(moves,key=lambda move:(-score(move),move.uci()))
    # Deliberate fallibility: sometimes choose a legal alternative without a reply search.
    if len(ranked)==1 or rng.random() < (.65 if level==1 else .9):return ranked[0]
    return rng.choice(ranked[1:])
