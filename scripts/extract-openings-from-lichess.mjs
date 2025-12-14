/**
 * Script para extraer aperturas de Lichess y agregarlas a los archivos TSV
 * 
 * Este script procesa las aperturas de forma sistemática:
 * 1. Extrae todas las aperturas del árbol de Lichess
 * 2. Para cada apertura, navega y extrae el PGN
 * 3. Calcula el FEN desde el PGN
 * 4. Determina el código ECO
 * 5. Agrega a los archivos TSV correspondientes
 * 
 * NOTA: Este script necesita ejecutarse con herramientas de automatización del navegador
 */

import { appendFile } from 'fs/promises';
import { join } from 'path';

/**
 * Convierte movimientos de formato Lichess a PGN estándar
 */
function convertLichessMovesToPGN(moves) {
  // moves es un array de strings como "Move 1, white, D 4"
  // Convierte a formato PGN estándar
  let pgn = "";
  let currentMoveNumber = 0;
  
  for (const move of moves) {
    const match = move.match(/Move (\d+), (white|black), (.+)/i);
    if (!match) continue;
    
    const [, moveNum, color, moveDesc] = match;
    const moveNumber = parseInt(moveNum, 10);
    
    // Convertir descripción a notación algebraica
    let san = moveDesc
      .replace(/\s+/g, "")
      .replace(/^([A-H])\s*(\d)$/, "$1$2")
      .replace(/^pawn\s*to\s*([A-H])(\d)$/i, "$1$2")
      .replace(/^knight\s*([A-H])(\d)$/i, "N$1$2")
      .replace(/^bishop\s*([A-H])(\d)$/i, "B$1$2")
      .replace(/^rook\s*([A-H])(\d)$/i, "R$1$2")
      .replace(/^queen\s*([A-H])(\d)$/i, "Q$1$2")
      .replace(/^king\s*([A-H])(\d)$/i, "K$1$2")
      .toLowerCase();
    
    if (color === "black") {
      if (moveNumber !== currentMoveNumber) {
        pgn += `${moveNumber}... ${san} `;
        currentMoveNumber = moveNumber;
      }
    } else {
      pgn += `${moveNumber}. ${san} `;
      currentMoveNumber = moveNumber;
    }
  }
  
  return pgn.trim();
}

/**
 * Determina el código ECO basado en el nombre de la apertura
 */
function determineECO(openingName) {
  const name = openingName.toLowerCase();
  
  // Mapeo básico - se puede expandir
  if (name.includes("alekhine")) return "B02";
  if (name.includes("king's indian") || name.includes("kings indian")) {
    if (name.includes("averbakh")) return "E70";
    if (name.includes("fianchetto")) return "E62";
    if (name.includes("sämisch") || name.includes("samisch")) return "E80";
    return "E60";
  }
  if (name.includes("sicilian")) return "B20";
  if (name.includes("french")) return "C00";
  if (name.includes("caro-kann")) return "B10";
  if (name.includes("queen's gambit") || name.includes("queens gambit")) return "D06";
  if (name.includes("nimzo-indian") || name.includes("nimzo indian")) return "E20";
  if (name.includes("catalan")) return "E00";
  
  return "A00";
}

/**
 * Agrega una apertura a su archivo TSV correspondiente
 */
async function addOpeningToTSV(eco, name, pgn, projectRoot) {
  const letter = eco[0].toUpperCase();
  const fileName = (letter >= "A" && letter <= "E") 
    ? `src-tauri/data/${letter.toLowerCase()}.tsv`
    : "src-tauri/data/e.tsv";
  
  const filePath = join(projectRoot, fileName);
  const line = `${eco}\t${name}\t${pgn}\n`;
  
  await appendFile(filePath, line, "utf-8");
}

// Este script necesita ejecutarse con herramientas de automatización del navegador
// para extraer los movimientos de cada página de apertura

