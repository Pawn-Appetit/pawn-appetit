/**
 * Script completo para procesar todas las aperturas de Lichess
 * 
 * Este script:
 * 1. Lee el snapshot del árbol de aperturas
 * 2. Extrae todas las aperturas y variantes
 * 3. Para cada una, navega y extrae el PGN
 * 4. Agrega a los archivos TSV
 */

import { readFile, appendFile } from 'fs/promises';
import { join } from 'path';

/**
 * Convierte movimientos de Lichess a PGN
 */
function convertMovesToPGN(moves) {
  let pgn = "";
  let lastMoveNum = 0;
  
  for (const move of moves) {
    const match = move.match(/Move (\d+), (white|black), (.+)/i);
    if (!match) continue;
    
    const [, moveNum, color, moveDesc] = match;
    const num = parseInt(moveNum, 10);
    
    // Convertir descripción a SAN
    let san = moveDesc.trim();
    
    // Casos especiales
    if (san.match(/^[A-H]\s*\d$/)) {
      // "E 4" -> "e4"
      san = san.replace(/\s+/g, "").toLowerCase();
    } else if (san.match(/^knight\s+[A-H]\s*\d$/i)) {
      // "knight F 6" -> "Nf6"
      san = san.replace(/^knight\s+/i, "").replace(/\s+/g, "").toLowerCase();
      san = "N" + san;
    } else if (san.match(/^bishop\s+[A-H]\s*\d$/i)) {
      san = san.replace(/^bishop\s+/i, "").replace(/\s+/g, "").toLowerCase();
      san = "B" + san;
    } else if (san.match(/^rook\s+[A-H]\s*\d$/i)) {
      san = san.replace(/^rook\s+/i, "").replace(/\s+/g, "").toLowerCase();
      san = "R" + san;
    } else if (san.match(/^queen\s+[A-H]\s*\d$/i)) {
      san = san.replace(/^queen\s+/i, "").replace(/\s+/g, "").toLowerCase();
      san = "Q" + san;
    } else if (san.match(/^king\s+[A-H]\s*\d$/i)) {
      san = san.replace(/^king\s+/i, "").replace(/\s+/g, "").toLowerCase();
      san = "K" + san;
    } else {
      // Intentar limpiar
      san = san.replace(/\s+/g, "").toLowerCase();
    }
    
    if (color === "white") {
      pgn += `${num}. ${san} `;
      lastMoveNum = num;
    } else {
      if (num === lastMoveNum) {
        pgn += `${san} `;
      } else {
        pgn += `${num}... ${san} `;
        lastMoveNum = num;
      }
    }
  }
  
  return pgn.trim();
}

/**
 * Determina ECO desde el nombre
 */
function getECO(name) {
  const n = name.toLowerCase();
  
  // King's Indian
  if (n.includes("king's indian") || n.includes("kings indian")) {
    if (n.includes("averbakh")) return "E70";
    if (n.includes("fianchetto")) return "E62";
    if (n.includes("sämisch") || n.includes("samisch")) return "E80";
    if (n.includes("classical")) return "E90";
    return "E60";
  }
  
  // Alekhine
  if (n.includes("alekhine")) return "B02";
  
  // Sicilian
  if (n.includes("sicilian")) {
    if (n.includes("dragon")) return "B70";
    if (n.includes("najdorf")) return "B90";
    if (n.includes("scheveningen")) return "B80";
    return "B20";
  }
  
  // French
  if (n.includes("french")) return "C00";
  
  // Caro-Kann
  if (n.includes("caro-kann") || n.includes("caro kann")) return "B10";
  
  // Queen's Gambit
  if (n.includes("queen's gambit") || n.includes("queens gambit")) {
    if (n.includes("declined")) return "D30";
    if (n.includes("accepted")) return "D20";
    return "D06";
  }
  
  // Nimzo-Indian
  if (n.includes("nimzo-indian") || n.includes("nimzo indian")) return "E20";
  
  // Catalan
  if (n.includes("catalan")) return "E00";
  
  // English
  if (n.includes("english")) return "A10";
  
  // Dutch
  if (n.includes("dutch")) return "A80";
  
  // Grünfeld
  if (n.includes("grünfeld") || n.includes("grunfeld")) return "D70";
  
  // Benoni
  if (n.includes("benoni")) return "A43";
  
  // Pirc
  if (n.includes("pirc")) return "B07";
  
  // Modern
  if (n.includes("modern defense")) return "B06";
  
  // Por defecto
  return "A00";
}

/**
 * Agrega apertura a TSV
 */
async function addToTSV(eco, name, pgn, projectRoot) {
  const letter = eco[0].toUpperCase();
  const file = (letter >= "A" && letter <= "E") 
    ? `src-tauri/data/${letter.toLowerCase()}.tsv`
    : "src-tauri/data/e.tsv";
  
  const path = join(projectRoot, file);
  const line = `${eco}\t${name}\t${pgn}\n`;
  
  await appendFile(path, line, "utf-8");
  console.log(`✓ Agregado: ${eco} - ${name}`);
}

export { convertMovesToPGN, getECO, addToTSV };

