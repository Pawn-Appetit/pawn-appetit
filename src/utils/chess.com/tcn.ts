import { charToRole, type NormalMove, parseSquare } from "chessops";

const pieceEncoding =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";

export function decodeTCN(moveCode: string): NormalMove {
    // Only decode the first move (2 chars), avoid unnecessary allocations and mutation
    const pieceIndex1 = pieceEncoding.indexOf(moveCode[0]);
    let pieceIndex2 = pieceEncoding.indexOf(moveCode[1]);
    let promotion: string | undefined;
    if (pieceIndex2 > 63) {
        promotion = "qnrbkp"[Math.floor((pieceIndex2 - 64) / 3)];
        pieceIndex2 = pieceIndex1 + (pieceIndex1 < 16 ? -8 : 8) + ((pieceIndex2 - 1) % 3) - 1;
    }
    const fromStr = pieceEncoding[pieceIndex1 % 8] + (Math.floor(pieceIndex1 / 8) + 1).toString();
    const toStr = pieceEncoding[pieceIndex2 % 8] + (Math.floor(pieceIndex2 / 8) + 1).toString();
    const from = parseSquare(fromStr);
    const to = parseSquare(toStr);
    if (!from || !to) {
        throw new Error(`Invalid TCN move: from='${fromStr}', to='${toStr}'`);
    }
    return promotion ? { from, to, promotion: charToRole(promotion) } : { from, to };
}
