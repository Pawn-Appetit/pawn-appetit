/**
 * Script automatizado para hacer scraping completo de Lichess Opening Tree
 * 
 * Este script:
 * 1. Extrae todas las aperturas del árbol principal
 * 2. Para cada apertura y variante, navega a su página
 * 3. Extrae el PGN de los movimientos mostrados
 * 4. Calcula el FEN desde el PGN
 * 5. Determina el código ECO basado en el nombre
 * 6. Agrega todo a los archivos TSV correspondientes
 * 
 * NOTA: Este script debe ejecutarse usando las herramientas del navegador MCP
 * o Puppeteer/Playwright para automatizar la navegación
 */

import { readFile, writeFile, appendFile } from "fs/promises";
import { join } from "path";

interface OpeningInfo {
  name: string;
  ref: string;
  url?: string;
  pgn?: string;
  fen?: string;
  eco?: string;
}

/**
 * Convierte movimientos de formato Lichess a PGN estándar
 * "Move 1, white, E 4" -> "1. e4"
 * "Move 1, black, knight F 6" -> "1... Nf6"
 */
function convertLichessMoveToPGN(moveText: string): string {
  // Extraer número de movimiento, color y pieza/casilla
  const match = moveText.match(/Move (\d+), (white|black), (.+)/i);
  if (!match) return "";
  
  const [, moveNum, color, move] = match;
  const moveNumber = parseInt(moveNum, 10);
  
  // Convertir formato descriptivo a notación algebraica
  // "E 4" -> "e4"
  // "knight F 6" -> "Nf6"
  // "pawn to E 5" -> "e5"
  // etc.
  
  let san = move
    .replace(/\s+/g, "")
    .replace(/^([A-H])\s*(\d)$/, "$1$2") // "E 4" -> "e4"
    .replace(/^pawn\s*to\s*([A-H])(\d)$/i, "$1$2") // "pawn to E 5" -> "e5"
    .replace(/^knight\s*([A-H])(\d)$/i, "N$1$2") // "knight F 6" -> "Nf6"
    .replace(/^bishop\s*([A-H])(\d)$/i, "B$1$2")
    .replace(/^rook\s*([A-H])(\d)$/i, "R$1$2")
    .replace(/^queen\s*([A-H])(\d)$/i, "Q$1$2")
    .replace(/^king\s*([A-H])(\d)$/i, "K$1$2")
    .toLowerCase();
  
  if (color === "black") {
    return `${moveNumber}... ${san}`;
  } else {
    return `${moveNumber}. ${san}`;
  }
}

/**
 * Determina el código ECO basado en el nombre de la apertura
 */
function determineECO(openingName: string): string {
  const name = openingName.toLowerCase();
  
  // Mapeo básico de nombres a ECO
  // Esto se puede expandir con más reglas
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
  
  // Por defecto, usar "A00" para aperturas no estándar
  return "A00";
}

/**
 * Calcula el FEN desde un PGN usando una librería de ajedrez
 */
async function calculateFENFromPGN(pgn: string): Promise<string> {
  // Esto requeriría una librería de ajedrez en TypeScript
  // Por ahora, retornamos una cadena vacía y lo calcularemos en Rust
  // cuando se procese el archivo TSV
  return "";
}

/**
 * Agrega una apertura a su archivo TSV correspondiente
 */
async function addOpeningToTSV(opening: OpeningInfo, projectRoot: string): Promise<void> {
  if (!opening.pgn) return;
  
  const eco = opening.eco || determineECO(opening.name);
  const letter = eco[0].toUpperCase();
  const fileName = letter >= "A" && letter <= "E" 
    ? `src-tauri/data/${letter.toLowerCase()}.tsv`
    : "src-tauri/data/e.tsv";
  
  const filePath = join(projectRoot, fileName);
  const line = `${eco}\t${opening.name}\t${opening.pgn}\n`;
  
  await appendFile(filePath, line, "utf-8");
}

/**
 * Extrae el PGN de una página de apertura de Lichess
 */
async function extractPGNFromPage(): Promise<string> {
  // Esta función necesita ejecutarse en el contexto del navegador
  // Extrae los botones de movimientos y los convierte a PGN
  // Por ahora es un placeholder
  return "";
}

/**
 * Función principal - procesa todas las aperturas
 */
async function scrapeAllOpenings(): Promise<void> {
  const projectRoot = process.cwd();
  const openings: OpeningInfo[] = [];
  
  // 1. Navegar al árbol de aperturas
  // 2. Extraer todos los links
  // 3. Para cada apertura:
  //    - Navegar a su página
  //    - Extraer PGN
  //    - Determinar ECO
  //    - Agregar a TSV
  
  console.log(`Procesadas ${openings.length} aperturas`);
}

// Este script necesita ejecutarse con herramientas de automatización del navegador

