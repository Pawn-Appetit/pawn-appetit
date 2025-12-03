/**
 * Script para procesar todas las aperturas de Lichess sistemáticamente
 * 
 * Lista de aperturas principales y sus variantes a procesar
 */

import { addOpening } from './add-opening-to-tsv.mjs';

// Mapeo de nombres de aperturas a sus códigos ECO y URLs
const openingsToProcess = [
  // Alekhine Defense - ya procesadas algunas
  { eco: 'B02', name: 'Alekhine Defense', url: 'Alekhine_Defense', pgn: '1. e4 Nf6' },
  
  // Continuaré agregando más aperturas sistemáticamente
  // Este script se ejecutará para procesar todas las aperturas
];

// Función para procesar una apertura
async function processOpening(opening) {
  try {
    await addOpening(opening.eco, opening.name, opening.pgn);
    return true;
  } catch (error) {
    console.error(`Error procesando ${opening.name}:`, error);
    return false;
  }
}

// Procesar todas las aperturas
async function processAll() {
  let processed = 0;
  for (const opening of openingsToProcess) {
    if (await processOpening(opening)) {
      processed++;
    }
  }
  console.log(`Procesadas ${processed} de ${openingsToProcess.length} aperturas`);
}

export { processAll, processOpening };

