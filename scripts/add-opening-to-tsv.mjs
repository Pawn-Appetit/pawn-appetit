/**
 * Script para agregar aperturas a los archivos TSV
 */

import { appendFile } from 'fs/promises';
import { join } from 'path';

export async function addOpening(eco, name, pgn, projectRoot = process.cwd()) {
  const letter = eco[0].toUpperCase();
  const file = (letter >= "A" && letter <= "E") 
    ? `src-tauri/data/${letter.toLowerCase()}.tsv`
    : "src-tauri/data/e.tsv";
  
  const path = join(projectRoot, file);
  const line = `${eco}\t${name}\t${pgn}\n`;
  
  await appendFile(path, line, "utf-8");
  console.log(`✓ Agregado: ${eco} - ${name}`);
}

