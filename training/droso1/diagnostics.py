"""Known diagnostic positions excluded from new evaluation splits."""
import chess

def after(moves):
    board = chess.Board()
    for move in moves.split():
        board.push_uci(move)
    return board.fen()


def mate_in_one(board):
    winning = []
    for move in board.legal_moves:
        child = board.copy()
        child.push(move)
        if child.is_checkmate():
            winning.append(move.uci())
    return winning


def mate_in_two(board):
    winning = []
    for move in board.legal_moves:
        child = board.copy()
        child.push(move)
        if child.is_game_over(claim_draw=True):
            continue
        for reply in child.legal_moves:
            grandchild = child.copy()
            grandchild.push(reply)
            if not mate_in_one(grandchild):
                break
        else:
            winning.append(move.uci())
    return winning


def cases():
    rows = [
        ('scholars_mate', 'mate1', after('e2e4 e7e5 f1c4 b8c6 d1h5 g8f6'), None),
        ('fools_mate_black', 'mate1', after('f2f3 e7e5 g2g4'), None),
        ('back_rank', 'mate1', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', None),
        ('supported_queen', 'mate1', '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', None),
        ('rook_on_edge', 'mate1', '7k/8/6K1/8/8/8/8/R7 w - - 0 1', None),
        ('sacrifice_rook_mate2', 'mate2', 'r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1', None),
        ('queen_mate2', 'mate2', '7k/8/5K2/8/8/8/8/3Q4 w - - 0 1', None),
        ('knight_takes_queen', 'free_material', '4k3/pp6/8/3q4/8/2N5/PP6/4K3 w - - 0 1', ['c3d5']),
        ('rook_takes_queen', 'free_material', '4k3/8/8/8/3q4/8/3R4/4K3 w - - 0 1', ['d2d4']),
        ('bishop_takes_queen', 'free_material', '4k3/8/8/3q4/8/1B6/8/4K3 w - - 0 1', ['b3d5']),
        ('pawn_takes_rook', 'free_material', '4k3/8/8/3r4/2P5/8/8/4K3 w - - 0 1', ['c4d5']),
        ('promote_with_mate', 'promotion', '7k/P7/6K1/8/8/8/8/8 w - - 0 1', ['a7a8q', 'a7a8r']),
        ('promote_to_major_piece', 'promotion', '8/P7/7k/8/8/2K5/8/8 w - - 0 1', ['a7a8q', 'a7a8r']),
        ('rook_underpromotion_mate2', 'underpromotion', '8/1P6/8/8/8/8/5K2/7k w - - 0 1', ['b7b8r']),
        ('capture_checking_rook', 'check_defence', '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', ['e1e2']),
    ]
    result = []
    for name, category, fen, expected in rows:
        board = chess.Board(fen)
        if not board.is_valid() or board.is_game_over(claim_draw=True):
            raise ValueError(f'invalid diagnostic position: {name}')
        if category == 'mate1':
            expected = mate_in_one(board)
        elif category == 'mate2':
            if mate_in_one(board):
                raise ValueError(f'{name} unexpectedly has a mate in one')
            expected = mate_in_two(board)
        elif category == 'underpromotion':
            if mate_in_two(board) != expected:
                raise ValueError('underpromotion mate proof changed')
            queen = board.copy()
            queen.push_uci('b7b8q')
            if not queen.is_stalemate():
                raise ValueError('queen promotion must stalemate')
        if not expected or any(chess.Move.from_uci(move) not in board.legal_moves for move in expected):
            raise ValueError(f'invalid expected moves: {name}')
        result.append({'name': name, 'category': category, 'fen': fen, 'expected': expected,
                       'expected_san': [board.san(chess.Move.from_uci(move)) for move in expected]})
    return result


