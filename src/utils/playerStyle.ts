/**
 * Player Style Analysis based on ECO codes.
 * Analyzes a player's opening repertoire to determine their playing style.
 */

export type StyleVector = {
    tactico: number;
    posicional: number;
    solido: number;
    gambitero: number;
    offbeat: number;
    sistematico: number;
    dinamico: number;
    hipermoderno: number;
  };
  
  export type PlayerStyleLabel = {
    label: string;
    description: string;
    color: string;
  };
  
  /**
   * Mapping of specific opening names to their ECO codes.
   * This helps detect rare and specific openings that might not be caught by general patterns.
   */
  const SPECIFIC_OPENING_MAP: Record<string, string> = {
    // Rare gambits and offbeat openings
    englund: "A40",
    "englund gambit": "A40",
    rousseau: "C50",
    "rousseau gambit": "C50",
    "blackmar-diemer": "D00",
    "blackmar diemer": "D00",
    "benko gambit": "A57",
    "volga gambit": "A57",
    "budapest gambit": "A51",
    "albin countergambit": "D08",
    "from's gambit": "A02",
    "staunton gambit": "A82",
    "elephant gambit": "C40",
    "latvian gambit": "C40",
    "king's gambit": "C30",
    "kings gambit": "C30",
    "evans gambit": "C51",
    "danish gambit": "C21",
    "halloween gambit": "C46",
    "muzio gambit": "C53",
    "scotch gambit": "C44",
    "vienna gambit": "C25",
    "wing gambit": "C00",
    "blumenfeld countergambit": "E10",
    "polovodin gambit": "E12",
    "spassky gambit": "E08",
    "hungarian gambit": "E00",
    "devin gambit": "E00",
    "polugaevsky gambit": "E17",
    "taimanov gambit": "E17",
    "averbakh gambit": "E30",
    "vitolins-adorjan gambit": "E32",
    "belyavsky gambit": "E34",
    "adorjan gambit": "E60",
    "leko gambit": "E60",
    "florentine gambit": "E77",
    "sämisch gambit": "E81",
    "kozul gambit": "E98",
    "shocron gambit": "E21",
    "romanovsky gambit": "E23",
    "dus-khotimirsky": "E10",
    "spielmann variation": "E10",
    "birmingham gambit": "A00",
    "bugayev": "A00",
    "tartakower gambit": "A00",
    "wolferts gambit": "A00",
    "schuehler gambit": "A00",
    "schiffler-sokolsky": "A00",
    "karniewski": "A00",
    "grigorian": "A00",
    "german defense": "A00",
    "czech defense": "A00",
    "baltic defense": "A00",
    "outflank": "A00",
    "queenside defense": "A00",
    "rooks swap": "A00",
    "king's indian variation": "A00",
    "sokolsky attack": "A00",
    "schiffler attack": "A00",
    "myers variation": "A00",
    "gent gambit": "A00",
    "paris gambit": "A00",
    "amar gambit": "A00",
    "polish gambit": "A00",
    "spike lee gambit": "A00",
    "kádas gambit": "A00",
    "schneider gambit": "A00",
    "steinbok gambit": "A00",
    "alessi gambit": "A00",
    "coca-cola gambit": "A00",
    "grob gambit": "A00",
    "basman gambit": "A00",
    "fritz gambit": "A00",
    "romford countergambit": "A00",
    "keres gambit": "A00",
    "richter-grob gambit": "A00",
    "zilbermints gambit": "A00",
    "zilbermints-hartlaub gambit": "A00",
    "zilbermints variation": "D00",
    "van kuijk gambit": "A00",
    "winterberg gambit": "A00",
    "pachman gambit": "A00",
    "brooklyn benko gambit": "A00",
    "reversed alekhine": "A00",
    "reversed brooklyn": "A00",
    "reversed french": "A00",
    "reversed krebs": "A00",
    "reversed mokele mbembe": "A00",
    "reversed norwegian": "A00",
    "reversed modern": "A00",
    "reversed philidor": "C00",
    "reversed rat": "A00",
    "reversed albin": "D00",
    "barnes opening": "A00",
    "fool's mate": "A00",
    "gedult gambit": "A00",
    "hammerschlag": "A00",
    "clemenz opening": "A00",
    "crab opening": "A00",
    "creepy crawly": "A00",
    "hippopotamus": "A00",
    "shy attack": "A00",
    "global opening": "A00",
    "grob opening": "A00",
    "hungarian opening": "A00",
    "kádas opening": "A00",
    "lasker simul special": "A00",
    "mieses opening": "A00",
    "polish opening": "A00",
    "saragossa opening": "A00",
    "sodium attack": "A00",
    "valencia opening": "A00",
    "van geet opening": "A00",
    "anderssen's opening": "A00",
    "amsterdam attack": "A00",
    "barnes defense": "B00",
    "borg defense": "B00",
    "carr defense": "B00",
    "duras gambit": "B00",
    "fried fox": "B00",
    "goldsmith defense": "B00",
    "picklepuss": "B00",
    "guatemala defense": "B00",
    "lemming defense": "B00",
    "lion defense": "B00",
    "lion's jaw": "B00",
    "nimzowitsch defense": "B00",
    "el columpio": "B00",
    "colorado countergambit": "B00",
    "french connection": "B00",
    "hornung gambit": "B00",
    "kennedy variation": "B00",
    "bielefelder gambit": "B00",
    "hammer gambit": "B00",
    "herford gambit": "B00",
    "keres attack": "B00",
    "linksspringer": "B00",
    "paulsen attack": "B00",
    "riemann defense": "B00",
    "de smet gambit": "B00",
    "mikenas variation": "B00",
    "neo-mongoloid": "B00",
    "pirc connection": "B00",
    "pseudo-spanish": "B00",
    "scandinavian variation": "B00",
    "aachen gambit": "B00",
    "advance variation": "B00",
    "bogoljubov variation": "B00",
    "brandics gambit": "B00",
    "erben gambit": "B00",
    "heinola-deppe gambit": "B00",
    "nimzowitsch gambit": "B00",
    "richter gambit": "B00",
    "vehre variation": "B00",
    "exchange variation": "B00",
    "marshall gambit": "B00",
    "wheeler gambit": "B00",
    "williams variation": "B00",
    "woodchuck variation": "B00",
    "owen defense": "B00",
    "hekili-loa gambit": "B00",
    "matovinsky gambit": "B00",
    "naselwaus gambit": "B00",
    "smith gambit": "B00",
    "unicorn variation": "B00",
    "wind gambit": "B00",
    "pirc defense": "B07",
    "rat defense": "B00",
    "antal defense": "B00",
    "fuller gambit": "B00",
    "harmonist": "B00",
    "petruccioli attack": "B00",
    "spike attack": "B00",
    "st. george defense": "B00",
    "san jorge variation": "B00",
    "ware defense": "B00",
    "snagglepuss": "B00",
    "berlin gambit": "B00",
    "scandinavian defense": "B01",
    "anderssen counterattack": "B01",
    "goteborg system": "B01",
    "orthodox attack": "B01",
    "blackburne gambit": "B01",
    "blackburne-kloosterboer": "B01",
    "boehnke gambit": "B01",
    "bronstein variation": "B01",
    "classical variation": "B01",
    "grünfeld variation": "B01",
    "gubinsky-melts": "B01",
    "icelandic-palme gambit": "B01",
    "kiel variation": "B01",
    "kloosterboer gambit": "B01",
    "alekhine defense": "B02",
    "modern defense": "B06",
    "robatsch defense": "B06",
    "old benoni": "A43",
    "benoni defense": "A56",
    "modern benoni": "A60",
    "old indian": "A53",
    "catalan opening": "E00",
    "bogo-indian": "E11",
    "queen's indian": "E12",
    "nimzo-indian": "E20",
    "king's indian": "E60",
    "grünfeld defense": "D80",
    "dutch defense": "A80",
    "london system": "D02",
    "colle system": "D04",
    "torre attack": "D03",
    "queen's gambit": "D30",
    "queens gambit": "D30",
    qgd: "D30",
    "slav defense": "D10",
    "semi-slav": "D43",
    semislav: "D43",
    "queen's gambit accepted": "D20",
    "queens gambit accepted": "D20",
    qga: "D20",
    "ruy lopez": "C60",
    spanish: "C60",
    "italian game": "C50",
    "giuoco piano": "C50",
    "two knights": "C55",
    "four knights": "C46",
    "three knights": "C46",
    "scotch game": "C44",
    ponziani: "C44",
    philidor: "C41",
    petrov: "C42",
    "vienna game": "C25",
    "bishop's opening": "C23",
    "center game": "C22",
    "french defense": "C00",
    "caro-kann": "B10",
    "sicilian defense": "B20",
    "english opening": "A10",
    "reti opening": "A04",
    "king's indian attack": "A07",
    "kings indian attack": "A07",
    "bird opening": "A02",
    "larsen's opening": "A01",
    "larsen opening": "A01",
    "nimzowitsch-larsen": "A01",
    "nimzo-larsen": "A01",
    "nimzo larsen": "A01",
    "zukertort opening": "A04",
    zukertort: "A04",
    "hartlaub-charlick": "A40",
    "hartlaub charlick": "A40",
    "blackburne-kostić": "C50",
    "blackburne kostić": "C50",
    "blackburne-kostic": "C50",
    "blackburne kostic": "C50",
    "nyezhmetdinov-rossolimo": "B30",
    "nyezhmetdinov rossolimo": "B30",
    "dragon variation": "B70",
    dragon: "B70",
    "van't kruijs": "A00",
    "dunst opening": "A00",
    "ware opening": "A00",
    "sokolsky opening": "A00",
  };
  
  /**
   * Opening characteristics extracted from full opening name.
   */
  type OpeningCharacteristics = {
    isGambit: boolean;
    isPositional: boolean;
    isTactical: boolean;
    isHypermodern: boolean;
    isSolid: boolean;
    isSystematic: boolean;
    isOffbeat: boolean;
    isDynamic: boolean;
  };
  
  /**
   * Analyze opening characteristics from the full opening name.
   */
  function analyzeOpeningCharacteristics(openingName: string): OpeningCharacteristics {
    if (!openingName) {
      return {
        isGambit: false,
        isPositional: false,
        isTactical: false,
        isHypermodern: false,
        isSolid: false,
        isSystematic: false,
        isOffbeat: false,
        isDynamic: false,
      };
    }
  
    const lower = openingName.toLowerCase();
    const characteristics: OpeningCharacteristics = {
      isGambit: false,
      isPositional: false,
      isTactical: false,
      isHypermodern: false,
      isSolid: false,
      isSystematic: false,
      isOffbeat: false,
      isDynamic: false,
    };
  
    // --- GAMBIT DETECTION ---
    const gambitKeywords = [
      "gambit",
      "countergambit",
      "birmingham gambit",
      "benko gambit",
      "volga gambit",
      "budapest gambit",
      "albin countergambit",
      "englund gambit",
      "rousseau gambit",
      "blackmar-diemer",
      "blackmar diemer",
      "king's gambit",
      "kings gambit",
      "evans gambit",
      "danish gambit",
      "halloween gambit",
      "muzio gambit",
      "scotch gambit",
      "vienna gambit",
      "elephant gambit",
      "latvian gambit",
      "staunton gambit",
      "from's gambit",
      "benoni gambit",
      "benoni gambit accepted",
      "blumenfeld countergambit",
      "polovodin gambit",
      "spassky gambit",
      "hungarian gambit",
      "devin gambit",
      "polugaevsky gambit",
      "taimanov gambit",
      "averbakh gambit",
      "vitolins-adorjan gambit",
      "belyavsky gambit",
      "adorjan gambit",
      "leko gambit",
      "florentine gambit",
      "sämisch gambit",
      "kozul gambit",
      "shocron gambit",
      "romanovsky gambit",
      "hartlaub-charlick",
      "blackburne-kostić",
      "blackburne kostic",
      "king's gambit accepted",
      "kings gambit accepted",
    ];
  
    if (gambitKeywords.some((keyword) => lower.includes(keyword)) && !lower.includes("declined")) {
      characteristics.isGambit = true;
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
    }
  
    // --- POSITIONAL OPENINGS ---
    // Note: Fianchetto-based openings are hypermodern, not just positional
    const positionalKeywords = [
      "catalan",
      "english opening",
      "reti",
      "queen's gambit declined",
      "queens gambit declined",
      "qgd",
      "slav",
      "semi-slav",
      "semislav",
      "ruy lopez",
      "spanish",
      "french defense",
      "caro-kann",
      "philidor",
      "petrov",
      "petrov's",
      "bogo-indian",
      "queen's indian",
      "queens indian",
      "nimzo-indian",
      "nimzo indian",
      "classical",
      "main line",
      "traditional",
      "orthodox",
      "exchange variation",
      "closed",
    ];
  
    if (positionalKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isPositional = true;
      characteristics.isSolid = true;
    }
  
    // --- TACTICAL OPENINGS ---
    const tacticalKeywords = [
      "sicilian",
      "dragon",
      "najdorf",
      "scheveningen",
      "sveshnikov",
      "kalashnikov",
      "taimanov",
      "kan",
      "dragon variation",
      "sharp",
      "aggressive",
      "attack",
      "sacrifice",
      "sac",
      "tactical",
    ];
  
    if (tacticalKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
    }
  
    // --- HYPERMODERN OPENINGS ---
    // Hypermodern openings control the center from a distance using flank development
    const hypermodernKeywords = [
      "king's indian",
      "kings indian",
      "grünfeld",
      "grunfeld",
      "benoni",
      "modern defense",
      "robatsch",
      "pirc",
      "nimzowitsch-larsen",
      "nimzo-larsen",
      "nimzo larsen",
      "larsen's",
      "larsen",
      "zukertort",
      "reti",
      "alekhine",
      "hypermodern",
      "fianchetto",
      "fianchettoed",
      "hyperaccelerated",
      "hyperaccelerated dragon",
      "king's english",
      "kings english",
      "english variation",
      "english opening",
      "catalan",
    ];
  
    if (hypermodernKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isHypermodern = true;
      characteristics.isDynamic = true;
      characteristics.isPositional = true;
      // Hypermodern openings are NOT offbeat - they are a recognized strategic approach
      characteristics.isOffbeat = false;
    }
  
    // --- SOLID OPENINGS ---
    const solidKeywords = [
      "french defense",
      "caro-kann",
      "philidor",
      "petrov",
      "petrov's",
      "queen's gambit declined",
      "queens gambit declined",
      "qgd",
      "slav",
      "semi-slav",
      "semislav",
      "solid",
      "safe",
      "defensive",
    ];
  
    if (solidKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isSolid = true;
      characteristics.isPositional = true;
    }
  
    // --- SYSTEMATIC OPENINGS ---
    const systematicKeywords = [
      "london system",
      "london",
      "colle system",
      "colle",
      "torre attack",
      "torre",
      "system",
      "systematic",
      "king's indian attack",
      "kings indian attack",
    ];
  
    if (systematicKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isSystematic = true;
      characteristics.isPositional = true;
    }
  
    // --- OFFBEAT / IRREGULAR ---
    // Note: Hypermodern openings (Nimzo-Larsen, Modern Defense, Pirc, etc.) are NOT offbeat
    const offbeatKeywords = [
      "polish opening",
      "sokolsky",
      "bird opening",
      "barnes",
      "grob",
      "amsterdam",
      "anderssen",
      "clemenz",
      "crab",
      "hippopotamus",
      "kádas",
      "mieses",
      "saragossa",
      "sodium",
      "valencia",
      "van geet",
      "irregular",
      "unusual",
      "rare",
      "offbeat",
    ];
  
    if (offbeatKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isOffbeat = true;
    }
  
    // --- DYNAMIC OPENINGS ---
    const dynamicKeywords = [
      "sicilian",
      "dragon",
      "king's indian",
      "kings indian",
      "grünfeld",
      "grunfeld",
      "benoni",
      "modern",
      "pirc",
      "dutch",
      "scandinavian",
      "alekhine",
      "hypermodern",
      "dynamic",
      "counterattack",
      "counterplay",
    ];
  
    if (dynamicKeywords.some((keyword) => lower.includes(keyword))) {
      characteristics.isDynamic = true;
    }
  
    // Special cases
  
    // King's Indian Attack: systematic and positional
    if (lower.includes("king's indian attack") || lower.includes("kings indian attack")) {
      characteristics.isSystematic = true;
      characteristics.isPositional = true;
    }
  
    // "Indian Defense" family is typically hypermodern & dynamic
    if (lower.includes("indian") && (lower.includes("defense") || lower.includes("variation"))) {
      characteristics.isHypermodern = true;
      characteristics.isDynamic = true;
      characteristics.isOffbeat = false; // Indian defenses are mainstream hypermodern
      if (!lower.includes("queen's indian") && !lower.includes("queens indian")) {
        characteristics.isTactical = true;
      }
    }
  
    // Sicilian
    if (lower.includes("sicilian")) {
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
      // Hyperaccelerated Dragon is hypermodern
      if (lower.includes("hyperaccelerated") || lower.includes("hyper-accelerated")) {
        characteristics.isHypermodern = true;
      }
    }
  
    // French
    if (lower.includes("french")) {
      characteristics.isSolid = true;
      characteristics.isPositional = true;
    }
  
    // Caro-Kann
    if (lower.includes("caro") || lower.includes("kann")) {
      characteristics.isSolid = true;
      characteristics.isPositional = true;
    }
  
    // Ruy Lopez / Spanish
    if (lower.includes("ruy lopez") || lower.includes("spanish")) {
      characteristics.isPositional = true;
      characteristics.isSolid = true;
    }
  
    // English Opening - can be positional or hypermodern depending on variation
    if (lower.includes("english opening") || lower.includes("english")) {
      characteristics.isPositional = true;
      // King's English and fianchetto variations are hypermodern
      if (lower.includes("king's english") || lower.includes("kings english") || lower.includes("fianchetto")) {
        characteristics.isHypermodern = true;
        characteristics.isDynamic = true;
        characteristics.isOffbeat = false;
      } else {
        characteristics.isSolid = true;
      }
    }
  
    // QGD
    if (lower.includes("queen's gambit declined") || lower.includes("queens gambit declined") || lower.includes("qgd")) {
      characteristics.isSolid = true;
      characteristics.isPositional = true;
    }
  
    // Slav
    if (lower.includes("slav")) {
      characteristics.isSolid = true;
      characteristics.isPositional = true;
    }
  
    // Benoni
    if (lower.includes("benoni")) {
      characteristics.isDynamic = true;
      characteristics.isTactical = true;
      if (lower.includes("old benoni")) {
        characteristics.isOffbeat = true;
      }
      if (lower.includes("modern benoni")) {
        characteristics.isHypermodern = true;
      }
    }
  
    // Scandinavian
    if (lower.includes("scandinavian")) {
      characteristics.isOffbeat = true;
      characteristics.isDynamic = true;
      if (lower.includes("main line")) {
        characteristics.isPositional = true;
      }
      if (lower.includes("mieses") || lower.includes("kotroc")) {
        characteristics.isTactical = true;
      }
    }
  
    // Horwitz
    if (lower.includes("horwitz")) {
      characteristics.isOffbeat = true;
      characteristics.isDynamic = true;
    }
  
    // Polish
    if (lower.includes("polish opening")) {
      characteristics.isOffbeat = true;
      if (
        lower.includes("czech defense") ||
        lower.includes("king's indian variation") ||
        lower.includes("kings indian variation")
      ) {
        characteristics.isPositional = true;
        characteristics.isDynamic = true;
      }
      if (lower.includes("outflank")) {
        characteristics.isTactical = true;
      }
    }
  
    // French variations
    if (lower.includes("french")) {
      if (lower.includes("knight variation") || lower.includes("two knights")) {
        characteristics.isPositional = true;
      }
      if (lower.includes("winawer") || lower.includes("advance")) {
        characteristics.isDynamic = true;
        characteristics.isTactical = true;
      }
    }
  
    // Italian
    if (lower.includes("italian")) {
      characteristics.isPositional = true;
      if (lower.includes("rousseau") || lower.includes("blackburne")) {
        characteristics.isGambit = true;
        characteristics.isTactical = true;
      }
    }
  
    // Ruy Lopez variations
    if (lower.includes("ruy lopez") || lower.includes("spanish")) {
      if (lower.includes("classical")) {
        characteristics.isPositional = true;
        characteristics.isSolid = true;
      }
      if (lower.includes("marshall") || lower.includes("open")) {
        characteristics.isTactical = true;
        characteristics.isDynamic = true;
      }
    }
  
    // Sicilian closed
    if (lower.includes("sicilian")) {
      if (lower.includes("closed")) {
        characteristics.isPositional = true;
      }
      if (lower.includes("old sicilian")) {
        characteristics.isTactical = true;
        characteristics.isDynamic = true;
      }
    }
  
    // QGA
    if (lower.includes("queen's gambit accepted") || lower.includes("queens gambit accepted") || lower.includes("qga")) {
      characteristics.isPositional = true;
      characteristics.isDynamic = true;
      characteristics.isGambit = false;
    }
  
    // Knights openings
    if (lower.includes("four knights") || lower.includes("three knights")) {
      characteristics.isPositional = true;
      characteristics.isSolid = true;
    }
  
    // Bishop's
    if (lower.includes("bishop's opening") || lower.includes("bishops opening")) {
      characteristics.isPositional = true;
    }
  
    // Scotch
    if (lower.includes("scotch game") || lower.includes("scotch")) {
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
    }
  
    return characteristics;
  }
  
  /**
   * Convenience wrapper to detect gambits directly from the name.
   */
  function isGambitName(name: string): boolean {
    return analyzeOpeningCharacteristics(name).isGambit;
  }
  
  /**
   * Extract ECO code from a full opening name using multiple strategies.
   */
  function extractEcoFromOpening(openingName: string): string | null {
    if (!openingName || openingName.trim().length === 0) return null;
  
    const name = openingName.trim();
    const lowerName = name.toLowerCase();
  
    // Strategy 1: ECO at start ("B90 Sicilian Defense ...")
    const directMatch = name.match(/^([A-E]\d{2})\s/);
    if (directMatch) {
      return directMatch[1];
    }
  
    // Strategy 2: specific name → ECO map
    for (const [key, eco] of Object.entries(SPECIFIC_OPENING_MAP)) {
      if (lowerName.includes(key)) {
        return eco;
      }
    }
  
    // Strategy 3: any ECO pattern in the string
    const anyEcoMatch = name.match(/\b([A-E]\d{2})\b/);
    if (anyEcoMatch) {
      return anyEcoMatch[1];
    }
  
    // Strategy 4: infer from keywords / families
  
    // Sicilians (B30–B99)
    if (
      lowerName.includes("sicilian") ||
      lowerName.includes("dragon") ||
      lowerName.includes("najdorf") ||
      lowerName.includes("scheveningen") ||
      lowerName.includes("sveshnikov") ||
      lowerName.includes("kalashnikov") ||
      lowerName.includes("taimanov") ||
      lowerName.includes("kan")
    ) {
      const sicilianMatch = name.match(/\b([B]\d{2})\b/);
      if (sicilianMatch) {
        const num = parseInt(sicilianMatch[1].slice(1), 10);
        if (num >= 30 && num <= 99) {
          return sicilianMatch[1];
        }
      }
      return "B50";
    }
  
    // French (C00–C19)
    if (lowerName.includes("french")) {
      const frenchMatch = name.match(/\b([C]\d{2})\b/);
      if (frenchMatch) {
        const num = parseInt(frenchMatch[1].slice(1), 10);
        if (num <= 19) return frenchMatch[1];
      }
      return "C00";
    }
  
    // Caro-Kann (B10–B19)
    if (lowerName.includes("caro") || lowerName.includes("kann")) {
      const caroMatch = name.match(/\b([B]\d{2})\b/);
      if (caroMatch) {
        const num = parseInt(caroMatch[1].slice(1), 10);
        if (num >= 10 && num <= 19) return caroMatch[1];
      }
      return "B10";
    }
  
    // QG / Slav / Semi-Slav (D10–D19, D30–D49)
    if (
      lowerName.includes("queen's gambit") ||
      lowerName.includes("queens gambit") ||
      lowerName.includes("qgd") ||
      lowerName.includes("semi-slav") ||
      lowerName.includes("semislav") ||
      lowerName.includes("slav")
    ) {
      const qgMatch = name.match(/\b([D]\d{2})\b/);
      if (qgMatch) {
        const num = parseInt(qgMatch[1].slice(1), 10);
        if ((num >= 10 && num <= 19) || (num >= 30 && num <= 49)) {
          return qgMatch[1];
        }
      }
      return "D30";
    }
  
    // Indian / Benoni / Benko families
    if (
      lowerName.includes("indian") ||
      lowerName.includes("nimzo") ||
      lowerName.includes("bogo") ||
      lowerName.includes("grünfeld") ||
      lowerName.includes("grunfeld") ||
      lowerName.includes("king's indian") ||
      lowerName.includes("kings indian") ||
      lowerName.includes("queen's indian") ||
      lowerName.includes("queens indian") ||
      lowerName.includes("benoni") ||
      lowerName.includes("benko")
    ) {
      const indianMatch = name.match(/\b([A-D-E]\d{2})\b/);
      if (indianMatch) {
        const letter = indianMatch[1][0];
        const num = parseInt(indianMatch[1].slice(1), 10);
        if (
          (letter === "A" && num >= 56 && num <= 79) ||
          (letter === "D" && num >= 80 && num <= 99) ||
          (letter === "E" && ((num >= 20 && num <= 29) || (num >= 60 && num <= 99)))
        ) {
          return indianMatch[1];
        }
      }
      return "E20";
    }
  
    // London / Colle / Torre
    if (lowerName.includes("london") || lowerName.includes("colle") || lowerName.includes("torre")) {
      const systemMatch = name.match(/\b([A-D]\d{2})\b/);
      if (systemMatch) {
        const letter = systemMatch[1][0];
        const num = parseInt(systemMatch[1].slice(1), 10);
        if ((letter === "D" && num >= 2 && num <= 5) || (letter === "A" && num >= 46 && num <= 48)) {
          return systemMatch[1];
        }
      }
      return "D02";
    }
  
    // English / Reti
    if (lowerName.includes("english") || lowerName.includes("reti")) {
      const englishMatch = name.match(/\b([A]\d{2})\b/);
      if (englishMatch) {
        const num = parseInt(englishMatch[1].slice(1), 10);
        if ((num >= 4 && num <= 9) || (num >= 10 && num <= 39)) {
          return englishMatch[1];
        }
      }
      return "A10";
    }
  
    // Ruy Lopez / Spanish
    if (lowerName.includes("ruy lopez") || lowerName.includes("spanish")) {
      const ruyMatch = name.match(/\b([C]\d{2})\b/);
      if (ruyMatch) {
        const num = parseInt(ruyMatch[1].slice(1), 10);
        if (num >= 60 && num <= 99) {
          return ruyMatch[1];
        }
      }
      return "C60";
    }
  
    // Italian
    if (lowerName.includes("italian")) {
      return "C50";
    }
  
    // Scandinavian
    if (lowerName.includes("scandinavian")) {
      return "B01";
    }
  
    // Alekhine / Modern / Pirc (B02–B09)
    if (lowerName.includes("alekhine") || lowerName.includes("modern") || lowerName.includes("pirc")) {
      const modernMatch = name.match(/\b([B]\d{2})\b/);
      if (modernMatch) {
        const num = parseInt(modernMatch[1].slice(1), 10);
        if (num >= 2 && num <= 9) {
          return modernMatch[1];
        }
      }
      return "B06";
    }
  
    // Dutch
    if (lowerName.includes("dutch")) {
      return "A80";
    }
  
    // Generic fallback for gambits with unknown ECO
    if (isGambitName(name)) {
      const gambitMatch = name.match(/\b([A-E]\d{2})\b/);
      if (gambitMatch) {
        return gambitMatch[1];
      }
      if (lowerName.includes("king's") || lowerName.includes("kings")) {
        return "C30";
      }
      if (lowerName.includes("queen's") || lowerName.includes("queens")) {
        return "D20";
      }
      return "C20";
    }
  
    return null;
  }
  
  /**
   * Analyze ECO codes and opening names to calculate style vector.
   * Works with either `string[]` (ECO only), `{ eco, openingName }[]`, or `{ eco, openingName, count }[]`.
   * When counts are provided, each opening is weighted by its frequency in the player's repertoire.
   */
  export function styleFromEcoList(
    openings: Array<{ eco: string; openingName: string; count?: number }> | string[],
  ): StyleVector {
    const v: StyleVector = {
      tactico: 0,
      posicional: 0,
      solido: 0,
      gambitero: 0,
      offbeat: 0,
      sistematico: 0,
      dinamico: 0,
      hipermoderno: 0,
    };
  
    // Track distinct gambit ECOs to detect true gambiteers
    const gambitEcos = new Set<string>();
  
    const normalizedOpenings: Array<{ eco: string; openingName: string; count: number }> = openings.map((item) =>
      typeof item === "string" ? { eco: item, openingName: "", count: 1 } : { ...item, count: item.count || 1 },
    );

    for (const { eco, openingName, count } of normalizedOpenings) {
      const code = eco.toUpperCase().trim();
      if (!code || code.length < 2) continue;
  
      const letter = code[0];
      const num = parseInt(code.slice(1), 10);
      if (isNaN(num)) continue;
  
      const lowerOpening = openingName.toLowerCase();
      const characteristics = analyzeOpeningCharacteristics(openingName);
      const isGambit = characteristics.isGambit;

      // Weight each contribution by the opening's frequency in the player's repertoire
      const weight = count;

      // --- A00–A03: irregular (Grob, Polish, etc.) ---
      if (letter === "A" && num >= 0 && num <= 3) {
        v.offbeat += (characteristics.isOffbeat ? 4 : 3) * weight;
        v.tactico += (characteristics.isTactical ? 2 : 1) * weight;
  
        if (characteristics.isHypermodern) {
          v.hipermoderno += 3 * weight;
          v.dinamico += 2 * weight;
          v.posicional += 1 * weight;
          // Hypermodern openings are NOT offbeat
        }

        if (num === 1 || characteristics.isHypermodern) {
          // A01 is Nimzo-Larsen - hypermodern, not offbeat
          if (characteristics.isHypermodern) {
            v.hipermoderno += 2 * weight;
            v.dinamico += 2 * weight;
            v.posicional += 1 * weight;
          } else {
            v.offbeat += 2 * weight;
            v.dinamico += 2 * weight;
            v.posicional += 1 * weight;
          }
        }

        if (isGambit) {
          v.gambitero += 3 * weight;
          gambitEcos.add(code);
        }

        if (lowerOpening.includes("polish opening") && !isGambit) {
          v.offbeat += 1 * weight;
          v.posicional += 1 * weight;
        }
      }

      // --- A04–A09: Reti / Zukertort / KIA ---
      if (letter === "A" && num >= 4 && num <= 9) {
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.sistematico += (characteristics.isSystematic ? 3 : 2) * weight;
        v.solido += (characteristics.isSolid ? 2 : 1) * weight;

        if (num === 4 || characteristics.isHypermodern) {
          // A04 is Zukertort - hypermodern, not offbeat
          if (characteristics.isHypermodern) {
            v.hipermoderno += 2 * weight;
            v.dinamico += 1 * weight;
          } else {
            v.offbeat += 2 * weight;
            v.dinamico += 1 * weight;
          }
        }

        if (num === 7 || characteristics.isSystematic) {
          v.sistematico += 1 * weight;
          v.posicional += 1 * weight;
        }
      }

      // --- A10–A39: English ---
      if (letter === "A" && num >= 10 && num <= 39) {
        if (characteristics.isHypermodern) {
          // King's English and fianchetto variations are hypermodern
          v.hipermoderno += 3 * weight;
          v.posicional += 2 * weight;
          v.dinamico += 2 * weight;
        } else {
          v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
          v.solido += (characteristics.isSolid ? 2 : 1) * weight;
          v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;
        }
      }

      // --- A40–A45: offbeat queen pawn (Englund etc.) ---
      if (letter === "A" && num >= 40 && num <= 45) {
        v.offbeat += 3 * weight;
        v.tactico += 2 * weight;
        if (isGambit) {
          v.gambitero += 4 * weight;
          gambitEcos.add(code);
        }
      }
  
      // --- A46–A48: Torre / London (system players) ---
      if (letter === "A" && num >= 46 && num <= 48) {
        v.sistematico += 3 * weight;
        v.posicional += 2 * weight;
        v.solido += 2 * weight;
      }

      // --- A50–A55: offbeat Indians ---
      if (letter === "A" && num >= 50 && num <= 55) {
        v.offbeat += 2 * weight;
        v.dinamico += 2 * weight;
        v.tactico += 1 * weight;
      }

      // --- A56–A79: Benoni / Benko / Indians ---
      if (letter === "A" && num >= 56 && num <= 79) {
        v.dinamico += 3 * weight;
        v.tactico += 2 * weight;
        v.posicional += 1 * weight;
        if (isGambit) {
          v.gambitero += 3 * weight;
          gambitEcos.add(code);
        }
      }

      // --- A80–A99: Dutch family ---
      if (letter === "A" && num >= 80 && num <= 99) {
        v.dinamico += 3 * weight;
        v.tactico += 2 * weight;
        v.offbeat += 1 * weight;
        if (isGambit) {
          v.gambitero += 2 * weight;
          gambitEcos.add(code);
        }
      }

      // --- B00–B05: weird 1.e4 replies ---
      if (letter === "B" && num >= 0 && num <= 5) {
        v.offbeat += 3 * weight;
        v.tactico += 1 * weight;
        v.dinamico += 1 * weight;
      }

      // --- B01: Scandinavian ---
      if (letter === "B" && num === 1) {
        v.offbeat += 2 * weight;
        v.dinamico += 2 * weight;
        v.tactico += (characteristics.isTactical ? 2 : 1) * weight;
      }

      // --- B02–B09: Alekhine / Modern / Pirc ---
      if (letter === "B" && num >= 2 && num <= 9) {
        v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 2 : 1) * weight;

        if (characteristics.isHypermodern) {
          // Modern Defense and Pirc are hypermodern, NOT offbeat
          v.hipermoderno += 3 * weight;
          v.dinamico += 1 * weight;
        } else if (characteristics.isOffbeat) {
          v.offbeat += 2 * weight;
        } else {
          v.offbeat += 1 * weight;
        }

        if (num >= 6 && num <= 9 || lowerOpening.includes("modern") || lowerOpening.includes("pirc")) {
          v.posicional += 1 * weight;
          if (characteristics.isHypermodern) {
            v.hipermoderno += 1 * weight;
          } else {
            v.offbeat += 1 * weight;
          }
        }
      }

      // --- B10–B19: Caro-Kann ---
      if (letter === "B" && num >= 10 && num <= 19) {
        v.solido += (characteristics.isSolid ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.tactico += (characteristics.isTactical ? 2 : 1) * weight;
      }

      // --- B20–B29: generic Sicilian ---
      if (letter === "B" && num >= 20 && num <= 29) {
        v.tactico += 2 * weight;
        v.dinamico += 2 * weight;
        v.posicional += 1 * weight;
      }

      // --- B30–B99: Sicilian mainline ---
      if (letter === "B" && num >= 30 && num <= 99) {
        v.tactico += (characteristics.isTactical ? 3 : 2) * weight;
        v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 2 : 1) * weight;

        if (characteristics.isHypermodern) {
          // Hyperaccelerated Dragon is hypermodern
          v.hipermoderno += 3 * weight;
        }

        if (num >= 70 && num <= 79 || lowerOpening.includes("dragon")) {
          v.tactico += 1 * weight;
          v.dinamico += 1 * weight;
          // Hyperaccelerated Dragon variant
          if (lowerOpening.includes("hyperaccelerated")) {
            v.hipermoderno += 2 * weight;
          }
        }

        // Only add offbeat if it's truly offbeat and NOT hypermodern
        if ((num >= 30 && num <= 39 || characteristics.isOffbeat) && !characteristics.isHypermodern) {
          v.offbeat += 1 * weight;
        }

        if (lowerOpening.includes("closed")) {
          v.posicional += 1 * weight;
          v.tactico -= 1 * weight; // clamped later
        }
      }

      // --- C00–C19: French ---
      if (letter === "C" && num >= 0 && num <= 19) {
        v.solido += (characteristics.isSolid ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.tactico += (characteristics.isTactical ? 2 : 1) * weight;

        if (lowerOpening.includes("winawer") || lowerOpening.includes("variation")) {
          v.dinamico += 1 * weight;
        }
      }

      // --- C20–C39: 1.e4 gambits / open games ---
      if (letter === "C" && num >= 20 && num <= 39) {
        if (isGambit) {
          v.gambitero += 4 * weight;
          v.tactico += 3 * weight;
          v.dinamico += 2 * weight;
          v.offbeat += 1 * weight;
          gambitEcos.add(code);
        } else {
          v.tactico += 2 * weight;
          v.dinamico += 1 * weight;
        }
      }

      // --- C40: King's Knight families ---
      if (letter === "C" && num === 40) {
        if (isGambit) {
          v.gambitero += 3 * weight;
          v.tactico += 2 * weight;
          v.offbeat += 1 * weight;
          gambitEcos.add(code);
        } else {
          v.tactico += 1 * weight;
        }
      }

      // --- C41–C42: Philidor / Petrov ---
      if (letter === "C" && num >= 41 && num <= 42) {
        v.solido += 3 * weight;
        v.posicional += 2 * weight;
      }

      // --- C43–C44: Petrov / Scotch ---
      if (letter === "C" && num >= 43 && num <= 44) {
        v.posicional += 2 * weight;
        v.tactico += 2 * weight;
        v.solido += 1 * weight;
        if (num === 44 && isGambit) {
          v.gambitero += 2 * weight;
          gambitEcos.add(code);
        }
      }

      // --- C45–C46: Scotch / Three/Four Knights ---
      if (letter === "C" && num >= 45 && num <= 46) {
        v.posicional += 2 * weight;
        v.solido += 2 * weight;
        if (num === 46 && isGambit) {
          v.gambitero += 2 * weight;
          v.offbeat += 1 * weight;
          gambitEcos.add(code);
        }
      }

      // --- C47–C49: Four Knights ---
      if (letter === "C" && num >= 47 && num <= 49) {
        v.posicional += 2 * weight;
        v.solido += 2 * weight;
      }

      // --- C50–C59: Italian / Two Knights ---
      if (letter === "C" && num >= 50 && num <= 59) {
        v.posicional += 2 * weight;
        v.tactico += 2 * weight;
        v.solido += 1 * weight;
        if (isGambit) {
          v.gambitero += 3 * weight;
          v.offbeat += 1 * weight;
          gambitEcos.add(code);
        }
      }

      // --- C60–C99: Ruy Lopez ---
      if (letter === "C" && num >= 60 && num <= 99) {
        v.posicional += 3 * weight;
        v.solido += 2 * weight;
        v.tactico += 1 * weight;
      }

      // --- D00–D01: irregular d-pawn (Blackmar-Diemer etc.) ---
      if (letter === "D" && num >= 0 && num <= 1) {
        v.offbeat += 2 * weight;
        v.tactico += 2 * weight;
        if (isGambit) {
          v.gambitero += 3 * weight;
          gambitEcos.add(code);
        }
      }

      // --- D02–D05: London / Colle / Torre ---
      if (letter === "D" && num >= 2 && num <= 5) {
        v.sistematico += (characteristics.isSystematic ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.solido += (characteristics.isSolid ? 2 : 1) * weight;
      }

      // --- D06–D09: QGD odd lines / Albin etc. ---
      if (letter === "D" && num >= 6 && num <= 9) {
        v.solido += 3 * weight;
        v.posicional += 3 * weight;
        if (isGambit) {
          v.gambitero += 2 * weight;
          v.tactico += 1 * weight;
          gambitEcos.add(code);
        }
      }

      // --- D10–D19: Slav ---
      if (letter === "D" && num >= 10 && num <= 19) {
        v.solido += (characteristics.isSolid ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;
      }

      // --- D20–D29: QGA ---
      if (letter === "D" && num >= 20 && num <= 29) {
        v.posicional += 3 * weight;
        v.dinamico += 2 * weight;
        v.solido += 1 * weight;
      }

      // --- D30–D49: QGD / Semi-Slav ---
      if (letter === "D" && num >= 30 && num <= 49) {
        v.solido += (characteristics.isSolid ? 3 : 2) * weight;
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;

        if (lowerOpening.includes("semi-slav") || lowerOpening.includes("semislav")) {
          v.dinamico += 1 * weight;
          v.tactico += 1 * weight;
        }
      }

      // --- D50–D79: various QGD families ---
      if (letter === "D" && num >= 50 && num <= 79) {
        v.solido += 3 * weight;
        v.posicional += 3 * weight;
      }

      // --- D80–D99: Grünfeld and friends ---
      if (letter === "D" && num >= 80 && num <= 99) {
        v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
        v.tactico += (characteristics.isTactical ? 3 : 2) * weight;
        // Grünfeld is hypermodern
        if (characteristics.isHypermodern) {
          v.hipermoderno += 4 * weight;
          v.posicional += 2 * weight;
        } else {
          v.posicional += 1 * weight;
        }
      }

      // --- E00–E09: Catalan / misc. ---
      if (letter === "E" && num >= 0 && num <= 9) {
        v.posicional += 3 * weight;
        v.solido += 2 * weight;
        v.dinamico += 1 * weight;
        if (isGambit) {
          v.gambitero += 2 * weight;
          gambitEcos.add(code);
        }
      }

      // --- E10–E19: Blumenfeld / Bogo / Q-Indian ---
      if (letter === "E" && num >= 10 && num <= 19) {
        v.posicional += 2 * weight;
        v.dinamico += 2 * weight;
        if (isGambit) {
          v.gambitero += 2 * weight;
          v.tactico += 1 * weight;
          gambitEcos.add(code);
        }
      }

      // --- E20–E59: Nimzo / Bogo families ---
      if (letter === "E" && num >= 20 && num <= 59) {
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
        if (characteristics.isHypermodern) {
          v.hipermoderno += 3 * weight;
          v.dinamico += 1 * weight;
          v.posicional += 1 * weight;
        }
        if (isGambit) {
          v.gambitero += 2 * weight;
          v.tactico += 1 * weight;
          gambitEcos.add(code);
        }
      }

      // --- E60–E99: King's Indian family ---
      if (letter === "E" && num >= 60 && num <= 99) {
        v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
        v.tactico += (characteristics.isTactical ? 3 : 2) * weight;
        
        // King's Indian is hypermodern
        if (characteristics.isHypermodern) {
          v.hipermoderno += 4 * weight;
          v.posicional += 2 * weight;
        } else {
          v.posicional += 1 * weight;
        }

        if (lowerOpening.includes("king's indian") || lowerOpening.includes("kings indian")) {
          v.hipermoderno += 1 * weight;
          v.dinamico += 1 * weight;
          v.posicional += 1 * weight;
        }

        if (isGambit) {
          v.gambitero += 2 * weight;
          gambitEcos.add(code);
        }
      }
    }
  
    // Bonus for players who use several distinct gambit ECO families
    if (gambitEcos.size >= 2) {
      v.gambitero += gambitEcos.size; // small extra
      v.offbeat += Math.floor(gambitEcos.size / 2);
    }
  
    // Clamp any negative component to zero
    (Object.keys(v) as (keyof StyleVector)[]).forEach((k) => {
      if (v[k] < 0) v[k] = 0;
    });
  
    return v;
  }
  
  /**
   * Determine player style label based on the style vector.
   * Uses normalized percentages and combination rules.
   * Returns labels with translation keys for i18n support.
   */
  export function getPlayerStyleLabel(vector: StyleVector): PlayerStyleLabel {
    const totalRaw = Object.values(vector).reduce((sum, val) => sum + val, 0);
    if (totalRaw === 0) {
      return {
        label: "playerStyle.mixedStyle",
        description: "playerStyle.mixedStyleDescription",
        color: "gray",
      };
    }
  
    // Normalize to percentages
    const normalized: StyleVector = {
      tactico: (vector.tactico / totalRaw) * 100,
      posicional: (vector.posicional / totalRaw) * 100,
      solido: (vector.solido / totalRaw) * 100,
      gambitero: (vector.gambitero / totalRaw) * 100,
      offbeat: (vector.offbeat / totalRaw) * 100,
      sistematico: (vector.sistematico / totalRaw) * 100,
      dinamico: (vector.dinamico / totalRaw) * 100,
      hipermoderno: (vector.hipermoderno / totalRaw) * 100,
    };
  
    const entries = (Object.entries(normalized) as [keyof StyleVector, number][])
      .sort((a, b) => b[1] - a[1]);
  
    const [primaryKey, primaryVal] = entries[0];
    const [, secondaryVal] = entries[1];
  
    const { tactico, posicional, solido, gambitero, offbeat, sistematico, dinamico, hipermoderno } = normalized;
  
    // If nothing clearly dominates, keep it mixed
    if (primaryVal < 16 && secondaryVal < 14) {
      return {
        label: "playerStyle.mixedStyle",
        description: "playerStyle.mixedStyleDescription",
        color: "gray",
      };
    }
  
    // ---- Derived metrics for style combinations ----
    const aggressiveBlend = (tactico + dinamico) / 2;
  
    const positionalCore =
      posicional >= 24 &&
      posicional >= tactico &&
      posicional >= dinamico;
  
    const gambitCore =
      gambitero >= 18 &&
      gambitero >= aggressiveBlend * 0.6 &&
      gambitero >= offbeat * 0.55 &&
      gambitero >= posicional * 0.6;
  
    const creativeGambiteer = gambitCore && offbeat >= 15;
  
    const systemsPlayer = sistematico >= 22 && posicional >= 18;
  
    // Only "unconventional" if offbeat dominates and player is NOT clearly positional or hypermodern
    const offbeatHeavy = offbeat >= 35 && gambitero < 20 && !positionalCore && hipermoderno < 20;
  
    const classicSolid = solido >= 24 && posicional >= 22 && dinamico < 26;
  
    const dynamicTactician = dinamico >= 25 && tactico >= 20 && gambitero < 24;
  
    // Hypermodern dynamic: prioritize if hipermoderno is significant
    const hypermodernDynamic =
      hipermoderno >= 20 &&
      dinamico >= 20 &&
      tactico >= 15 &&
      (hipermoderno >= offbeat || offbeat < 25);
  
    // ---- Complex labels (order matters!) ----
  
    // 1) Creative gambiteer (Englund, Rousseau, King's Gambit, etc.)
    if (creativeGambiteer) {
      return {
        label: "playerStyle.creativeGambiteer",
        description: "playerStyle.creativeGambiteerDescription",
        color: "violet",
      };
    }

    // 2) Strong gambiteer without so much offbeat
    if (gambitCore) {
      return {
        label: "playerStyle.gambiteer",
        description: "playerStyle.gambiteerDescription",
        color: "violet",
      };
    }

    // 3) System player (London / Colle / Torre / KIA)
    if (systemsPlayer) {
      return {
        label: "playerStyle.systemPlayer",
        description: "playerStyle.systemPlayerDescription",
        color: "teal",
      };
    }

    // 4) Classical solid (QGD, Slav, French/Caro core)
    if (classicSolid) {
      return {
        label: "playerStyle.classicalSolid",
        description: "playerStyle.classicalSolidDescription",
        color: "blue",
      };
    }

    // 5) Hypermodern dynamic (KID, Grünfeld, Benoni, Modern Defense, Nimzo-Larsen, Hyperaccelerated Dragon)
    // Check BEFORE positional to prioritize hypermodern classification
    if (hypermodernDynamic) {
      return {
        label: "playerStyle.hypermodernDynamic",
        description: "playerStyle.hypermodernDynamicDescription",
        color: "orange",
      };
    }

    // 6) Positional core (only if NOT hypermodern)
    if (positionalCore && hipermoderno < 18 && (solido + sistematico >= 18 || offbeat <= 28)) {
      return {
        label: "playerStyle.positional",
        description: "playerStyle.positionalDescription",
        color: "cyan",
      };
    }

    // 7) Strongly unconventional repertoire
    if (offbeatHeavy) {
      return {
        label: "playerStyle.unconventionalOpenings",
        description: "playerStyle.unconventionalOpeningsDescription",
        color: "grape",
      };
    }

    // 8) Generic dynamic tactician
    if (dynamicTactician) {
      return {
        label: "playerStyle.dynamicTactician",
        description: "playerStyle.dynamicTacticianDescription",
        color: "red",
      };
    }

    // ---- Simple, axis-based labels ----

    if (gambitero >= 22) {
      return {
        label: "playerStyle.gambiteer",
        description: "playerStyle.gambiteerSimpleDescription",
        color: "violet",
      };
    }

    // Check hypermodern before other simple categories
    if (hipermoderno >= 22) {
      return {
        label: "playerStyle.hypermodernDynamic",
        description: "playerStyle.hypermodernDynamicDescription",
        color: "orange",
      };
    }

    if (offbeat >= 28 && gambitero < 22 && hipermoderno < 20) {
      return {
        label: "playerStyle.unconventional",
        description: "playerStyle.unconventionalDescription",
        color: "grape",
      };
    }

    if (sistematico >= 24) {
      return {
        label: "playerStyle.systematic",
        description: "playerStyle.systematicDescription",
        color: "teal",
      };
    }

    if (posicional >= 26 && posicional >= tactico && posicional >= dinamico && hipermoderno < 18) {
      return {
        label: "playerStyle.positional",
        description: "playerStyle.positionalSimpleDescription",
        color: "cyan",
      };
    }

    if (tactico >= 26 && tactico >= posicional && tactico >= solido) {
      return {
        label: "playerStyle.tactical",
        description: "playerStyle.tacticalDescription",
        color: "pink",
      };
    }

    if (dinamico >= 26) {
      return {
        label: "playerStyle.dynamic",
        description: "playerStyle.dynamicDescription",
        color: "yellow",
      };
    }

    if (solido >= 24) {
      return {
        label: "playerStyle.solid",
        description: "playerStyle.solidDescription",
        color: "blue",
      };
    }

    // ---- Final fallback: map by primary axis ----
    const styleMap: Record<keyof StyleVector, PlayerStyleLabel> = {
      tactico: {
        label: "playerStyle.tactical",
        description: "playerStyle.tacticalFallbackDescription",
        color: "pink",
      },
      posicional: {
        label: "playerStyle.positional",
        description: "playerStyle.positionalFallbackDescription",
        color: "cyan",
      },
      solido: {
        label: "playerStyle.solid",
        description: "playerStyle.solidFallbackDescription",
        color: "blue",
      },
      gambitero: {
        label: "playerStyle.gambiteer",
        description: "playerStyle.gambiteerFallbackDescription",
        color: "violet",
      },
      offbeat: {
        label: "playerStyle.unconventional",
        description: "playerStyle.unconventionalFallbackDescription",
        color: "grape",
      },
      sistematico: {
        label: "playerStyle.systematic",
        description: "playerStyle.systematicFallbackDescription",
        color: "teal",
      },
      dinamico: {
        label: "playerStyle.dynamic",
        description: "playerStyle.dynamicFallbackDescription",
        color: "orange",
      },
      hipermoderno: {
        label: "playerStyle.hypermodernDynamic",
        description: "playerStyle.hypermodernDynamicDescription",
        color: "orange",
      },
    };

    return styleMap[primaryKey] ?? {
      label: "playerStyle.mixedStyle",
      description: "playerStyle.mixedStyleDescription",
      color: "gray",
    };
  }
  
  /**
   * Extract ECO codes and opening names from PlayerGameInfo.
   * Returns only the most common openings (top 10 or until 50% of games are covered).
   * This focuses the style analysis on the player's core repertoire rather than rare openings.
   */
  export function extractEcosFromPlayerInfo(
    info: { site_stats_data: Array<{ data: Array<{ opening: string }> }> } | null | undefined,
  ): Array<{ eco: string; openingName: string; count: number }> {
    if (!info?.site_stats_data) return [];

    // Count occurrences of each opening
    const openingCounts = new Map<string, { eco: string; openingName: string; count: number }>();
    let totalGames = 0;

    for (const siteData of info.site_stats_data) {
      for (const game of siteData.data) {
        totalGames++;
        const eco = extractEcoFromOpening(game.opening);
        if (eco && game.opening) {
          const key = `${eco}:${game.opening}`;
          const existing = openingCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            openingCounts.set(key, { eco, openingName: game.opening, count: 1 });
          }
        }
      }
    }

    // Sort by count (descending) and take top openings
    const sortedOpenings = Array.from(openingCounts.values()).sort((a, b) => b.count - a.count);

    // Take top 10 openings OR until we cover 50% of games
    const targetGames = Math.ceil(totalGames * 0.5);
    const selectedOpenings: Array<{ eco: string; openingName: string; count: number }> = [];
    let cumulativeGames = 0;

    for (const opening of sortedOpenings) {
      selectedOpenings.push(opening);
      cumulativeGames += opening.count;

      // Stop if we have 10 openings OR we've covered 50% of games
      if (selectedOpenings.length >= 10 || cumulativeGames >= targetGames) {
        break;
      }
    }

    return selectedOpenings;
  }
  
  /**
   * High-level helper: analyze player style from PlayerGameInfo.
   * Analyzes only the most common openings (top 10 or 50% of games) to focus on core repertoire.
   */
  export function analyzePlayerStyle(
    info: { site_stats_data: Array<{ data: Array<{ opening: string }> }> } | null | undefined,
  ): PlayerStyleLabel {
    const openings = extractEcosFromPlayerInfo(info);
    if (openings.length === 0) {
      return {
        label: "playerStyle.noData",
        description: "playerStyle.noDataDescription",
        color: "gray",
      };
    }

    const vector = styleFromEcoList(openings);
    return getPlayerStyleLabel(vector);
  }
  