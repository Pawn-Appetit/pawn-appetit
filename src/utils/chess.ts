import type { DrawShape } from "@lichess-org/chessground/draw";
import { type Color, type Move, makeSquare, makeUci, type Role } from "chessops";
import { type Chess, castlingSide, normalizeMove } from "chessops/chess";
import { INITIAL_FEN, makeFen, parseFen } from "chessops/fen";
import { isPawns, parseComment } from "chessops/pgn";
import { makeSan, parseSan } from "chessops/san";
import { match } from "ts-pattern";
import { commands, type Outcome, type Score, type Token } from "@/bindings";
import { ANNOTATION_INFO, type Annotation, isBasicAnnotation, NAG_INFO } from "./annotation";
import { parseSanOrUci, positionFromFen } from "./chessops";
import { harmonicMean, isPrefix, mean } from "./misc";
import { formatScore, getAccuracy, getCPLoss, INITIAL_SCORE } from "./score";
import { createNode, defaultTree, type GameHeaders, getNodeAtPath, type TreeNode, type TreeState } from "./treeReducer";
import { unwrap } from "./unwrap";

export interface BestMoves {
  depth: number;
  score: Score;
  uciMoves: string[];
  sanMoves: string[];
  multipv: number;
  nps: number;
}

export interface MoveAnalysis {
  best: BestMoves[];
  novelty: boolean;
  is_sacrifice: boolean;
}

// copied from chessops
export const makeClk = (seconds: number): string => {
  let s = Math.max(0, seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  s = (s % 3600) % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${s.toLocaleString("en", {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 3,
  })}`;
};

export function getMoveText(
  tree: TreeNode,
  opt: {
    glyphs: boolean;
    comments: boolean;
    extraMarkups: boolean;
    isFirst?: boolean;
  },
): string {
  const isBlack = tree.halfMoves % 2 === 0;
  const moveNumber = Math.ceil(tree.halfMoves / 2);
  let moveText = "";

  if (tree.san) {
    if (isBlack) {
      if (opt.isFirst) {
        moveText += `${moveNumber}... `;
      }
    } else {
      moveText += `${moveNumber}. `;
    }
    moveText += tree.san;
    if (opt.glyphs) {
      // Only show ONE basic annotation (the most important one)
      // This prevents multiple annotations from appearing like "!?!?!?"
      let basicAnnotation: Annotation | null = null;
      const otherAnnotations: Annotation[] = [];

      for (const annotation of tree.annotations) {
        if (annotation === "") continue;
        const annotationInfo = ANNOTATION_INFO[annotation];
        if (!annotationInfo) continue; // Skip if annotation is not in ANNOTATION_INFO

        if (isBasicAnnotation(annotation)) {
          // Keep only the most important basic annotation
          // Priority: ?? > ? > ?! > !? > ! > !! > Best
          if (!basicAnnotation) {
            basicAnnotation = annotation;
          } else {
            // Compare priorities - lower nag number = higher priority for basic annotations
            const currentPriority = annotationInfo.nag;
            const existingPriority = ANNOTATION_INFO[basicAnnotation]?.nag ?? 999;
            if (currentPriority < existingPriority) {
              basicAnnotation = annotation;
            }
          }
        } else {
          // Keep non-basic annotations
          otherAnnotations.push(annotation);
        }
      }

      // Add the single basic annotation
      if (basicAnnotation) {
        // Best uses NAG $8, not "*" (which is reserved for game result)
        // NAG $1 is already used for "!" (good/great)
        if (basicAnnotation === "Best") {
          moveText += " $8";
        } else {
          moveText += basicAnnotation;
        }
      }

      // Add non-basic annotations as NAGs
      for (const annotation of otherAnnotations) {
        const annotationInfo = ANNOTATION_INFO[annotation];
        if (annotationInfo) {
          moveText += ` $${annotationInfo.nag}`;
        }
      }
    }
    moveText += " ";
  }

  if (opt.comments || opt.extraMarkups) {
    let content = "{";

    if (opt.extraMarkups) {
      if (tree.score !== null) {
        if (tree.score.value.type === "cp") {
          content += `[%eval ${formatScore(tree.score.value)}] `;
        } else {
          content += `[%eval #${tree.score.value.value}] `;
        }
      }
      if (tree.clock !== undefined) {
        content += `[%clk ${makeClk(tree.clock)}] `;
      }
    }

    if (opt.extraMarkups && tree.shapes.length > 0) {
      const squares = tree.shapes.filter((shape) => shape.dest === undefined);
      const arrows = tree.shapes.filter((shape) => shape.dest !== undefined);

      if (squares.length > 0) {
        content += `[%csl ${squares
          .map((shape) => {
            return shape.brush![0].toUpperCase() + shape.orig;
          })
          .join(",")}]`;
      }
      if (arrows.length > 0) {
        content += `[%cal ${arrows
          .map((shape) => {
            return shape.brush![0].toUpperCase() + shape.orig + shape.dest;
          })
          .join(",")}]`;
      }
    }

    if (opt.comments && tree.comment !== "") {
      content += tree.comment;
    }
    content += "} ";

    if (content !== "{} ") {
      moveText += content;
    }
  }
  return moveText;
}

export function getLastMainlinePosition(root: TreeNode): number[] {
  const position = [];
  for (let node = root; node.children.length > 0; node = node.children[0]) {
    if (node.move) {
      position.push(0);
    }
  }
  return position;
}

export function getMainLine(root: TreeNode, is960: boolean): string[] {
  return getVariationLine(root, getLastMainlinePosition(root), is960, true);
}

// outputs the correct uci move for castling in chess960 and standard chess
export function uciNormalize(chess: Chess, move: Move, chess960?: boolean) {
  const side = castlingSide(chess, move);
  const frcMove = normalizeMove(chess, move);
  if (side && !chess960) {
    const standardMove = match(makeUci(frcMove))
      .with("e1h1", () => "e1g1")
      .with("e1a1", () => "e1c1")
      .with("e8h8", () => "e8g8")
      .with("e8a8", () => "e8c8")
      .otherwise((v) => v);
    return standardMove;
  }
  return makeUci(frcMove);
}

export function getVariationLine(
  root: TreeNode,
  position: number[],
  chess960?: boolean,
  includeLastMove = false,
): string[] {
  const moves = [];
  let node = root;
  const [chess] = positionFromFen(root.fen);
  if (!chess) {
    return [];
  }
  for (const pos of position) {
    node = node.children[pos];
    if (node.move) {
      moves.push(uciNormalize(chess, node.move, chess960));
      chess.play(node.move);
    }
  }
  if (includeLastMove && node.children.length > 0) {
    moves.push(uciNormalize(chess, node.children[0].move!, chess960));
  }
  return moves;
}

function headersToPGN(game: GameHeaders): string {
  let headers = `[Event "${game.event || "?"}"]
[Site "${game.site || "?"}"]
[Date "${game.date || "????.??.??"}"]
[Round "${game.round || "?"}"]
[White "${game.white || "?"}"]
[Black "${game.black || "?"}"]
[Result "${game.result}"]
`;
  if (game.white_elo) {
    headers += `[WhiteElo "${game.white_elo}"]\n`;
  }
  if (game.black_elo) {
    headers += `[BlackElo "${game.black_elo}"]\n`;
  }
  if (game.start && game.start.length > 0) {
    headers += `[Start "${JSON.stringify(game.start)}"]\n`;
  }
  if (game.orientation) {
    headers += `[Orientation "${game.orientation}"]\n`;
  }
  if (game.time_control) {
    headers += `[TimeControl "${game.time_control}"]\n`;
  }
  if (game.white_time_control) {
    headers += `[WhiteTimeControl "${game.white_time_control}"]\n`;
  }
  if (game.black_time_control) {
    headers += `[BlackTimeControl "${game.black_time_control}"]\n`;
  }
  if (game.eco) {
    headers += `[ECO "${game.eco}"]\n`;
  }
  if (game.variant) {
    headers += `[Variant "${game.variant}"]\n`;
  }
  return headers;
}

export function defaultPGN() {
  return `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n*`;
}

export function getPGN(
  tree: TreeNode,
  {
    headers,
    glyphs,
    comments,
    variations,
    extraMarkups,
    root = true,
    path = null,
  }: {
    headers: GameHeaders | null;
    glyphs: boolean;
    comments: boolean;
    variations: boolean;
    extraMarkups: boolean;
    root?: boolean;
    path?: number[] | null;
  },
): string {
  if (path && path.length === 0) {
    return "";
  }
  let pgn = "";
  if (headers) {
    pgn += headersToPGN(headers);
  }
  if (root && tree.fen !== INITIAL_FEN) {
    pgn += '[SetUp "1"]\n';
    pgn += `[FEN "${tree.fen}"]\n`;
  }
  pgn += "\n";
  if (root && tree.comment !== null) {
    pgn += `${getMoveText(tree, {
      glyphs,
      comments,
      extraMarkups,
    })}`;
  }
  if (tree.children.length > 0) {
    const mainChild = tree.children[path ? path[0] : 0];

    // Add the move text for the main line child
    pgn += getMoveText(mainChild, {
      glyphs: glyphs,
      comments,
      extraMarkups,
      isFirst: root,
    });

    // Add variations right after the current move, before continuing with the main line
    // Variations are stored as siblings of the main line child
    // Process variations if: variations are enabled AND we're not following a specific path AND there are variations
    if (variations && !path && tree.children.length > 1) {
      const variationsPGN = tree.children.slice(1).map((variation) => {
        // For variations, we need to process the entire variation tree recursively
        // This includes the variation's move and all its children (which may include sub-variations)
        return getVariationPGN(variation, {
          glyphs,
          comments,
          extraMarkups,
          variations,
          isFirst: true,
        });
      });
      for (const variation of variationsPGN) {
        if (variation) {
          pgn += ` (${variation}) `;
        }
      }
    }

    // Continue with the main line after variations
    // Process mainChild's children, which may include more moves and variations
    if (mainChild.children.length > 0) {
      pgn += getPGN(mainChild, {
        headers: null,
        glyphs,
        comments,
        variations,
        extraMarkups,
        root: false,
        path: path ? path.slice(1) : null,
      });
    }
  } else if (!root && tree.san) {
    // If this is a leaf node (no children) and we're not at root,
    // we still need to output the move text
    pgn += getMoveText(tree, {
      glyphs,
      comments,
      extraMarkups,
      isFirst: false,
    });
  }
  if (root && headers) {
    pgn += ` ${headers.result}`;
  }
  return pgn.trim();
}

/**
 * Helper function to generate PGN for a variation (without headers)
 * This processes a variation node and all its children recursively,
 * including sub-variations
 */
function getVariationPGN(
  node: TreeNode,
  {
    glyphs,
    comments,
    extraMarkups,
    variations,
    isFirst = false,
  }: {
    glyphs: boolean;
    comments: boolean;
    extraMarkups: boolean;
    variations: boolean;
    isFirst?: boolean;
  },
): string {
  let pgn = "";

  // Add the move text for this variation node
  if (node.san) {
    pgn += getMoveText(node, {
      glyphs,
      comments,
      extraMarkups,
      isFirst,
    });
  }

  // Process the main line of this variation (first child)
  if (node.children.length > 0) {
    const mainChild = node.children[0];

    // Process the main line using getPGN recursively, which will:
    // 1. Add the main child's move text with correct numbering
    // 2. Add nested sub-variations of the main child (these appear right after mainChild's move)
    // 3. Continue recursively with the main line, preserving all nested variations
    // This ensures that deeply nested variations are preserved correctly
    if (mainChild.san) {
      // Determine if the first move needs special numbering
      const isFirstInContinuation = !!node.san;
      const isBlackMove = mainChild.halfMoves % 2 === 0;
      const shouldUseIsFirst = isFirstInContinuation && isBlackMove;
      
      // Add the move text for the main child with correct numbering
      pgn += getMoveText(mainChild, {
        glyphs,
        comments,
        extraMarkups,
        isFirst: shouldUseIsFirst,
      });

      // Use getPGN recursively to process the rest of the main line and all nested variations
      // This will correctly handle deeply nested variations within the main line
      // getPGN with root=false will process mainChild's children (not mainChild itself)
      if (mainChild.children.length > 0) {
        pgn += getPGN(mainChild, {
          headers: null,
          glyphs,
          comments,
          variations,
          extraMarkups,
          root: false,
          path: null,
        });
      }
    }

    // Add top-level sub-variations of this variation (siblings of the main child)
    // These are variations that appear at the same level as the main line within the variation
    // They appear after the entire main line has been processed
    if (variations && node.children.length > 1) {
      const subVariationsPGN = node.children.slice(1).map((subVariation) => {
        return getVariationPGN(subVariation, {
          glyphs,
          comments,
          extraMarkups,
          variations,
          isFirst: true,
        });
      });
      for (const subVariation of subVariationsPGN) {
        if (subVariation) {
          pgn += ` (${subVariation}) `;
        }
      }
    }
  }

  return pgn.trim();
}

export function parseKeyboardMove(san: string, fen: string) {
  function cleanSan(san: string) {
    if (san.length > 2) {
      const cleanedSan = san
        .replace(/^([kqbnr])/i, (_, match) => match.toUpperCase())
        .replace("o-o-o", "O-O-O")
        .replace("o-o", "O-O");
      return cleanedSan;
    }
    return san;
  }

  const [pos] = positionFromFen(fen);
  if (!pos) {
    return null;
  }
  const move = parseSanOrUci(pos, san);
  if (move) {
    return move;
  }
  const newSan = cleanSan(san);
  const newMove = parseSanOrUci(pos, newSan);
  if (newMove) {
    return newMove;
  }
  return null;
}

export async function getOpening(root: TreeNode, position: number[]): Promise<string> {
  const tree = getNodeAtPath(root, position);
  if (tree === null) {
    return "";
  }
  const res = await commands.getOpeningFromFen(tree.fen);
  if (res.status === "error") {
    if (position.length === 0) {
      return "";
    }
    return getOpening(root, position.slice(0, -1));
  }
  return res.data;
}

function innerParsePGN(tokens: Token[], fen: string = INITIAL_FEN, halfMoves = 0, isVariantsMode = false): TreeState {
  const tree = defaultTree(fen);
  let root = tree.root;
  let prevNode = root;
  // Keep track of the parent node where variations should be added
  // This is the node before the current move, updated after each move
  let variationParentNode = root;
  root.halfMoves = halfMoves;
  const setup = parseFen(fen).unwrap();

  if (halfMoves === 0 && setup.turn === "black") {
    root.halfMoves += 1;
  }

  // In variants mode, collect all move sequences as variations (no main line)
  if (isVariantsMode) {
    // Collect all move sequences (separated by variations or end of tokens)
    const sequences: Token[][] = [];
    let currentSequence: Token[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === "ParenOpen") {
        // If we have a sequence collected, save it as a variation
        if (currentSequence.length > 0) {
          sequences.push([...currentSequence]);
          currentSequence = [];
        }
        // Collect the variation tokens (including nested variations)
        const variation: Token[] = [token]; // Include the opening paren
        let subvariations = 0;
        i++;
        while (i < tokens.length && (subvariations > 0 || tokens[i].type !== "ParenClose")) {
          if (tokens[i].type === "ParenOpen") {
            subvariations++;
          } else if (tokens[i].type === "ParenClose") {
            subvariations--;
          }
          variation.push(tokens[i]);
          i++;
        }
        // Include the closing paren if we found it
        if (i < tokens.length && tokens[i].type === "ParenClose") {
          variation.push(tokens[i]);
        }
        // Add the variation as a sequence
        if (variation.length > 0) {
          sequences.push(variation);
        }
      } else if (token.type === "ParenClose") {
        // Should not happen here in normal flow, but handle it
        if (currentSequence.length > 0) {
          sequences.push([...currentSequence]);
          currentSequence = [];
        }
      } else if (token.type === "Outcome") {
        // End of game, save current sequence if any
        if (currentSequence.length > 0) {
          sequences.push([...currentSequence]);
          currentSequence = [];
        }
        break;
      } else {
        // Add token to current sequence (moves, comments, nags, etc.)
        currentSequence.push(token);
      }
    }

    // Save last sequence if any (this is the "main line" which should also be a variation)
    if (currentSequence.length > 0) {
      sequences.push([...currentSequence]);
    }

    // Parse each sequence as a separate variation (no main line)
    // All sequences are treated equally as variations
    for (const sequence of sequences) {
      // Check if this sequence starts with a paren (it's already a variation)
      const isVariation = sequence.length > 0 && sequence[0].type === "ParenOpen";

      if (isVariation) {
        // Parse as a variation (remove outer parens and parse)
        const variationTokens = sequence.slice(1, -1); // Remove opening and closing parens
        const newTree = innerParsePGN(variationTokens, root.fen, root.halfMoves, false);
        if (newTree.root.children.length > 0) {
          root.children.push(newTree.root.children[0]);
        }
      } else {
        // Parse as a regular sequence (will become a variation)
        const newTree = innerParsePGN(sequence, root.fen, root.halfMoves, false);
        if (newTree.root.children.length > 0) {
          root.children.push(newTree.root.children[0]);
        }
      }
    }

    return tree;
  }

  // Normal parsing mode (maintains main line and variations)
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "Comment") {
      const comment = parseComment(token.value);

      if (comment.evaluation) {
        if (isPawns(comment.evaluation)) {
          root.score = {
            value: {
              type: "cp",
              value: comment.evaluation.pawns * 100,
            },
            wdl: null,
          };
        } else {
          root.score = {
            value: {
              type: "mate",
              value: comment.evaluation.mate,
            },
            wdl: null,
          };
        }
      }

      if (comment.shapes.length > 0) {
        const shapes: DrawShape[] = comment.shapes.map((shape) => ({
          orig: makeSquare(shape.from),
          dest: makeSquare(shape.to),
          brush: shape.color,
        }));
        root.shapes.push(...shapes);
      }

      if (comment.clock) {
        root.clock = comment.clock;
      }

      root.comment = comment.text;
      i++;
    } else if (token.type === "ParenOpen") {
      const variation = [];
      let subvariations = 0;
      i++; // Skip the opening paren
      while (i < tokens.length && (subvariations > 0 || tokens[i].type !== "ParenClose")) {
        if (tokens[i].type === "ParenOpen") {
          subvariations++;
        } else if (tokens[i].type === "ParenClose") {
          subvariations--;
        }
        variation.push(tokens[i]);
        i++;
      }
      // The loop exits when we find the matching closing paren
      // At this point, i points to the closing paren (which we don't include in variation)
      // We need to skip it so the main loop continues with the next token
      if (i < tokens.length && tokens[i].type === "ParenClose") {
        i++; // Skip the closing paren
      }
      // Parse variation normally to maintain nested variations
      // Variations should be added to the variation parent node (the node before the current move)
      // Use variationParentNode.halfMoves to ensure correct move numbering
      // Use isVariantsMode=false to parse variations correctly (they should be added as siblings)
      const variationHalfMoves = variationParentNode.halfMoves;
      const newTree = innerParsePGN(variation, variationParentNode.fen, variationHalfMoves, false);
      // Add ALL children from the parsed variation tree
      // The first child is the main line of the variation (which contains all nested sub-variations)
      // Additional children are top-level variations within the variation (siblings of the main line)
      // All nested sub-variations within the main line are already preserved within the main line tree structure
      for (const child of newTree.root.children) {
        variationParentNode.children.push(child);
      }
      // IMPORTANT: After processing a variation, the main line should continue from the current root
      // The root remains the same (it's the node after the move where the variation was attached)
      // Subsequent moves in the main line will be added as children of the current root
      // No need to change root or variationParentNode here - the loop will continue and process
      // the next tokens (which should be moves in the main line after the variation)
      // Note: i was already incremented to skip the closing paren, so we continue without incrementing
      continue;
    } else if (token.type === "ParenClose") {
      // Should not normally happen in normal parsing mode, but handle it
      i++;
      continue;
    } else if (token.type === "Nag") {
      const nagAnnotation = NAG_INFO.get(token.value) || "";
      if (nagAnnotation && ANNOTATION_INFO[nagAnnotation]) {
        // Remove all existing basic annotations before adding the new one
        // This prevents multiple basic annotations from accumulating
        const filteredAnnotations = root.annotations.filter((ann) => {
          const annInfo = ANNOTATION_INFO[ann];
          // Keep annotations that are not basic (group !== "basic")
          return !annInfo || annInfo.group !== "basic";
        });
        root.annotations = [...filteredAnnotations, nagAnnotation];
        root.annotations.sort((a, b) => {
          const aInfo = ANNOTATION_INFO[a];
          const bInfo = ANNOTATION_INFO[b];
          if (!aInfo || !bInfo) return 0;
          return aInfo.nag - bInfo.nag;
        });
      }
      i++;
    } else if (token.type === "San") {
      const [pos, error] = positionFromFen(root.fen);
      if (error) {
        i++;
        continue;
      }
      // Parse the SAN (no longer support "*" as it's reserved for game result)
      const sanValue = token.value;
      const move = parseSan(pos, sanValue);
      if (!move) {
        i++;
        continue;
      }
      const san = makeSan(pos, move);
      pos.play(move);

      const newTree = createNode({
        fen: makeFen(pos.toSetup()),
        move,
        san,
        halfMoves: root.halfMoves + 1,
      });

      root.children.push(newTree);

      // Update variation parent node BEFORE updating root
      // Variations in PGN appear after a move but refer to the position BEFORE that move
      // So variations should be added to the parent node (root) before we move to the new node
      variationParentNode = root;
      prevNode = root;
      root = newTree;
      i++;
    } else if (token.type === "Outcome") {
      break;
    } else {
      // Unknown token type, skip it
      i++;
    }
  }

  return tree;
}

export async function parsePGN(pgn: string, initialFen?: string, isVariantsMode = false): Promise<TreeState> {
  const tokens = unwrap(await commands.lexPgn(pgn));

  const headers = getPgnHeaders(tokens);
  const fen = initialFen?.trim() || headers.fen.trim();

  const [pos] = positionFromFen(fen);

  const tree = innerParsePGN(
    tokens,
    initialFen?.trim() || headers.fen.trim(),
    pos?.turn === "black" ? 1 : 0,
    isVariantsMode,
  );
  tree.headers = headers;
  tree.position = headers.start ?? [];
  return tree;
}

export function getPgnHeaders(tokens: Token[]): GameHeaders {
  const headersN = new Map<string, string>();

  for (const token of tokens) {
    if (token.type === "Header") {
      const { tag, value } = token.value;
      headersN.set(tag, value);
    } else if (token.type === "Outcome") {
      headersN.set("Result", token.value);
    }
  }

  const {
    Black,
    White,
    BlackElo,
    WhiteElo,
    // biome-ignore lint/suspicious/noShadowRestrictedNames: this is a name from the PGN standard
    Date,
    Site,
    Event,
    Result,
    FEN,
    Round,
    Start,
    Orientation,
    TimeControl,
    Variant,
  } = Object.fromEntries(headersN);

  const fenToUse = FEN ?? INITIAL_FEN;
  const fenParts = fenToUse.split(" ");
  const activeColor = fenParts[1];
  const orientationFromFen = activeColor === "b" ? "black" : "white";

  const headers: GameHeaders = {
    id: 0,
    fen: fenToUse,
    result: (Result as Outcome) ?? "*",
    black: Black ?? "?",
    white: White ?? "?",
    round: Round ?? "?",
    black_elo: BlackElo ? Number.parseInt(BlackElo, 10) : 0,
    white_elo: WhiteElo ? Number.parseInt(WhiteElo, 10) : 0,
    date: Date ?? "",
    site: Site ?? "",
    event: Event ?? "",
    start: JSON.parse(Start ?? "[]"),
    orientation: (Orientation as "white" | "black") ?? orientationFromFen,
    time_control: TimeControl,
    variant: Variant,
  };
  return headers;
}

type ColorMap<T> = {
  [key in Color]: T;
};

export function getGameStats(root: TreeNode) {
  const whiteAnnotations = {
    "??": 0,
    "?": 0,
    "?!": 0,
    "!!": 0,
    "!": 0,
    "!?": 0,
    Best: 0,
  };

  const blackAnnotations = {
    "??": 0,
    "?": 0,
    "?!": 0,
    "!!": 0,
    "!": 0,
    "!?": 0,
    Best: 0,
  };

  if (root.children.length === 0) {
    return {
      whiteCPL: 0,
      blackCPL: 0,
      whiteAccuracy: 0,
      blackAccuracy: 0,
      whiteAnnotations,
      blackAnnotations,
    };
  }

  let prevScore: Score = root.score ?? INITIAL_SCORE;
  const cplosses: ColorMap<number[]> = {
    white: [],
    black: [],
  };
  const accuracies: ColorMap<number[]> = {
    white: [],
    black: [],
  };
  let node = root;
  while (node.children.length > 0) {
    node = node.children[0];
    for (const annotation of node.annotations) {
      if (isBasicAnnotation(annotation)) {
        if (node.halfMoves % 2 === 1) {
          whiteAnnotations[annotation]++;
        } else {
          blackAnnotations[annotation]++;
        }
      }
    }
    const color = node.halfMoves % 2 === 1 ? "white" : "black";
    if (node.score) {
      cplosses[color].push(getCPLoss(prevScore.value, node.score.value, color));
      accuracies[color].push(getAccuracy(prevScore.value, node.score.value, color));
      prevScore = node.score;
    }
  }
  const whiteCPL = mean(cplosses.white);
  const blackCPL = mean(cplosses.black);
  const whiteAccuracy = harmonicMean(accuracies.white);
  const blackAccuracy = harmonicMean(accuracies.black);

  return {
    whiteCPL,
    blackCPL,
    whiteAccuracy,
    blackAccuracy,
    whiteAnnotations,
    blackAnnotations,
  };
}

export type PiecesCount = {
  p: number;
  n: number;
  b: number;
  r: number;
  q: number;
};

export function getMaterialDiff(fen: string) {
  const res = parseFen(fen);
  if (res.isErr) {
    return null;
  }
  const board = res.unwrap().board;
  const { white, black } = board;

  const pieceDiff = (piece: Role) => white.intersect(board[piece]).size() - black.intersect(board[piece]).size();

  const pieces = {
    p: pieceDiff("pawn"),
    n: pieceDiff("knight"),
    b: pieceDiff("bishop"),
    r: pieceDiff("rook"),
    q: pieceDiff("queen"),
  };

  const diff = pieces.p * 1 + pieces.n * 3 + pieces.b * 3 + pieces.r * 5 + pieces.q * 9;

  return { pieces, diff };
}

export function stripClock(fen: string): string {
  return fen.split(" ").slice(0, -2).join(" ");
}

export function hasMorePriority(position1: number[], position2: number[]): boolean {
  if (isPrefix(position1, position2)) {
    return true;
  }

  // remove common beggining of the arrays
  let i = 0;
  while (i < position1.length && i < position2.length && position1[i] === position2[i]) {
    i++;
  }

  return position1[i] < position2[i];
}
