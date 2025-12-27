use std::{collections::{VecDeque, HashMap}, path::PathBuf, sync::Mutex, fs::File, io::{Read, BufReader, Seek, SeekFrom}};

use diesel::{dsl::sql, sql_types::Bool, Connection, ExpressionMethods, QueryDsl, RunQueryDsl, insert_into, connection::SimpleConnection, BoolExpressionMethods};
use once_cell::sync::Lazy;
use rand::Rng;
use serde::Deserialize;
use serde::Serialize;
use specta::Type;
use tauri::{path::BaseDirectory, Manager, Emitter};
use csv::ReaderBuilder;

use crate::{
    db::{puzzles, Puzzle},
    error::Error,
};

/// Converts a technical theme name to a friendly name
fn get_theme_friendly_name(theme: &str) -> String {
    let theme_lower = theme.to_lowercase();
    let friendly_names: HashMap<&str, &str> = [
        ("advantage", "Advantage"),
        ("anastasiamate", "Anastasia's Mate"),
        ("arabianmate", "Arabian Mate"),
        ("attackingf2f7", "Attacking f2/f7"),
        ("backrankmate", "Back Rank Mate"),
        ("bishopendgame", "Bishop Endgame"),
        ("bodenmate", "Boden's Mate"),
        ("capturingdefender", "Capturing Defender"),
        ("castling", "Castling"),
        ("crushing", "Crushing"),
        ("defensive", "Defensive"),
        ("deflection", "Deflection"),
        ("discoveredattack", "Discovered Attack"),
        ("doublecheck", "Double Check"),
        ("doublestake", "Double Threat"),
        ("endgame", "Endgame"),
        ("enpassant", "En Passant"),
        ("equality", "Equality"),
        ("exposedking", "Exposed King"),
        ("fork", "Fork"),
        ("hangingpiece", "Hanging Piece"),
        ("interference", "Interference"),
        ("intermezzo", "Intermezzo"),
        ("knightendgame", "Knight Endgame"),
        ("long", "Long"),
        ("mate", "Mate"),
        ("matein1", "Mate in 1"),
        ("matein2", "Mate in 2"),
        ("matein3", "Mate in 3"),
        ("matein4", "Mate in 4"),
        ("matein5", "Mate in 5"),
        ("middlegame", "Middlegame"),
        ("one-move", "One Move"),
        ("opening", "Opening"),
        ("pawnendgame", "Pawn Endgame"),
        ("pin", "Pin"),
        ("promotion", "Promotion"),
        ("queenendgame", "Queen Endgame"),
        ("queenrookendgame", "Queen & Rook Endgame"),
        ("queenrook", "Queen & Rook"),
        ("doublebishopmate", "Double Bishop Mate"),
        ("doublebishop", "Double Bishop"),
        ("queensideattack", "Queenside Attack"),
        ("kingsideattack", "Kingside Attack"),
        ("quietmove", "Quiet Move"),
        ("rookendgame", "Rook Endgame"),
        ("sacrifice", "Sacrifice"),
        ("short", "Short"),
        ("skewer", "Skewer"),
        ("smotheredmate", "Smothered Mate"),
        ("trappedpiece", "Trapped Piece"),
        ("underpromotion", "Underpromotion"),
        ("verylong", "Very Long"),
        ("x-rayattack", "X-Ray Attack"),
        ("zugzwang", "Zugzwang"),
    ]
    .iter()
    .cloned()
    .collect();
    
    // Check exact match first
    if let Some(friendly) = friendly_names.get(theme_lower.as_str()) {
        return friendly.to_string();
    }
    
    // Try to split camelCase or words separated by common patterns
    // Split on common word boundaries: lowercase to uppercase transitions, numbers, etc.
    let mut result = String::new();
    let mut chars = theme.chars().peekable();
    let mut prev_was_lower = false;
    let mut prev_was_upper = false;
    let mut prev_was_digit = false;
    let mut word_start = true;
    
    while let Some(ch) = chars.next() {
        let is_upper = ch.is_uppercase();
        let is_lower = ch.is_lowercase();
        let is_digit = ch.is_ascii_digit();
        
        // Add space before uppercase if previous was lowercase or digit
        if is_upper && (prev_was_lower || prev_was_digit) && !result.is_empty() {
            result.push(' ');
            word_start = true;
        }
        // Add space before lowercase if we have multiple uppercase letters in a row (like "QueenRook")
        else if is_lower && prev_was_upper {
            if let Some(&next_ch) = chars.peek() {
                if next_ch.is_uppercase() {
                    result.push(' ');
                    word_start = true;
                }
            }
        }
        // Add space before digit if previous was letter
        else if is_digit && (prev_was_lower || prev_was_upper) && !result.is_empty() {
            result.push(' ');
            word_start = true;
        }
        
        // Handle special cases
        if ch == '-' || ch == '_' {
            result.push(' ');
            word_start = true;
            continue;
        }
        
        // Capitalize first letter of each word
        if word_start {
            result.push_str(&ch.to_uppercase().collect::<String>());
            word_start = false;
        } else {
            result.push(ch);
        }
        
        prev_was_lower = is_lower;
        prev_was_upper = is_upper;
        prev_was_digit = is_digit;
    }
    
    // Clean up multiple spaces
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");
    
    // Handle common patterns and fix specific cases
    result = result
        .replace("End Game", "Endgame")
        .replace("Mate In", "Mate in")
        .replace("Queen Rook", "Queen & Rook")
        .replace("King Side", "Kingside")
        .replace("Queen Side", "Queenside")
        .replace("X Ray", "X-Ray")
        .replace("En Passant", "En Passant")
        .replace("F 2 F 7", "f2/f7")
        .replace("F2 F7", "f2/f7");
    
    result
}

/// Converts a technical opening tag name to a friendly name
fn get_opening_tag_friendly_name(tag: &str) -> String {
    let tag_lower = tag.to_lowercase();
    let friendly_names: HashMap<&str, &str> = [
        ("sicilian", "Sicilian Defense"),
        ("french", "French Defense"),
        ("catalan", "Catalan Opening"),
        ("queensgambit", "Queen's Gambit"),
        ("kingsgambit", "King's Gambit"),
        ("italian", "Italian Game"),
        ("spanish", "Spanish Game"),
        ("ruylopez", "Ruy López"),
        ("carokann", "Caro-Kann Defense"),
        ("pirc", "Pirc Defense"),
        ("modern", "Modern Defense"),
        ("nimzoindian", "Nimzo-Indian Defense"),
        ("queensindian", "Queen's Indian Defense"),
        ("kingsindian", "King's Indian Defense"),
        ("english", "English Opening"),
        ("dutch", "Dutch Defense"),
        ("scandinavian", "Scandinavian Defense"),
        ("alekhine", "Alekhine's Defense"),
        ("benoni", "Benoni Defense"),
        ("grunfeld", "Grünfeld Defense"),
        ("london", "London System"),
        ("trompowsky", "Trompowsky Attack"),
        ("reti", "Réti Opening"),
        ("bird", "Bird's Opening"),
        ("bogoindian", "Bogo-Indian Defense"),
        ("slav", "Slav Defense"),
        ("semi-slav", "Semi-Slav Defense"),
        ("tarrasch", "Tarrasch Defense"),
        ("scholar", "Scholar's Mate"),
        ("fools", "Fool's Mate"),
    ]
    .iter()
    .cloned()
    .collect();
    
    // Check exact match first
    if let Some(friendly) = friendly_names.get(tag_lower.as_str()) {
        return friendly.to_string();
    }
    
    // Split camelCase or words separated by common patterns
    // This handles cases like "QueenRook" -> "Queen Rook"
    let mut result = String::new();
    let mut chars = tag.chars().peekable();
    let mut prev_was_lower = false;
    let mut prev_was_upper = false;
    let mut prev_was_digit = false;
    let mut word_start = true;
    
    while let Some(ch) = chars.next() {
        let is_upper = ch.is_uppercase();
        let is_lower = ch.is_lowercase();
        let is_digit = ch.is_ascii_digit();
        
        // Add space before uppercase if previous was lowercase or digit
        if is_upper && (prev_was_lower || prev_was_digit) && !result.is_empty() {
            result.push(' ');
            word_start = true;
        }
        // Add space before lowercase if we have multiple uppercase letters in a row (like "QueenRook")
        else if is_lower && prev_was_upper {
            if let Some(&next_ch) = chars.peek() {
                if next_ch.is_uppercase() {
                    result.push(' ');
                    word_start = true;
                }
            }
        }
        // Add space before digit if previous was letter
        else if is_digit && (prev_was_lower || prev_was_upper) && !result.is_empty() {
            result.push(' ');
            word_start = true;
        }
        
        // Handle special cases
        if ch == '-' || ch == '_' {
            result.push(' ');
            word_start = true;
            continue;
        }
        
        // Capitalize first letter of each word
        if word_start {
            result.push_str(&ch.to_uppercase().collect::<String>());
            word_start = false;
        } else {
            result.push(ch);
        }
        
        prev_was_lower = is_lower;
        prev_was_upper = is_upper;
        prev_was_digit = is_digit;
    }
    
    // Clean up multiple spaces
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");
    
    // Handle common patterns and fix specific cases
    result = result
        .replace("Queen Rook", "Queen & Rook")
        .replace("King Side", "Kingside")
        .replace("Queen Side", "Queenside")
        .replace("Semi Slav", "Semi-Slav")
        .replace("Bogo Indian", "Bogo-Indian")
        .replace("Nimzo Indian", "Nimzo-Indian")
        .replace("King S", "King's")
        .replace("Queen S", "Queen's");
    
    result
}

/// Cache for puzzles to reduce database queries
#[derive(Debug)]
struct PuzzleCache {
    /// Queue of puzzles loaded from the database
    cache: VecDeque<Puzzle>,
    /// Current position in the cache
    counter: usize,
    /// Minimum rating filter used for the current cache
    min_rating: u16,
    /// Maximum rating filter used for the current cache
    max_rating: u16,
    /// Maximum number of puzzles to cache at once
    cache_size: usize,
    /// Random flag used for the current cache
    random: bool,
    /// Themes filter used for the current cache
    themes: Option<Vec<String>>,
    /// Opening tags filter used for the current cache
    opening_tags: Option<Vec<String>>,
}

impl PuzzleCache {
    /// Create a new puzzle cache with default settings
    fn new() -> Self {
        Self {
            cache: VecDeque::new(),
            counter: 0,
            min_rating: 0,
            max_rating: 0,
            cache_size: 20, // Default cache size
            random: true,
            themes: None,
            opening_tags: None,
        }
    }

    /// Configure the cache size
    ///
    /// # Arguments
    /// * `size` - The maximum number of puzzles to cache at once
    #[allow(dead_code)]
    fn with_cache_size(mut self, size: usize) -> Self {
        self.cache_size = size;
        self
    }

    /// Optimized query using normalized tables with JOINs instead of LIKE
    /// This is much faster for filtering by themes and opening_tags
    fn get_puzzles_with_normalized_tables(
        &self,
        db: &mut diesel::SqliteConnection,
        min_rating: u16,
        max_rating: u16,
        random: bool,
        themes: Option<&Vec<String>>,
        opening_tags: Option<&Vec<String>>,
    ) -> Result<Vec<Puzzle>, Error> {
        use diesel::sql_query;
        use diesel::prelude::*;
        use diesel::deserialize::QueryableByName;
        use diesel::sql_types::{BigInt, Integer, Nullable, Text};
        
        // Structs for query results
        #[derive(QueryableByName)]
        struct CountResult {
            #[diesel(sql_type = BigInt, column_name = "count")]
            count: i64,
        }
        
        #[derive(QueryableByName)]
        struct PuzzleRow {
            #[diesel(sql_type = Integer, column_name = "id")]
            id: i32,
            #[diesel(sql_type = Text, column_name = "fen")]
            fen: String,
            #[diesel(sql_type = Text, column_name = "moves")]
            moves: String,
            #[diesel(sql_type = Integer, column_name = "rating")]
            rating: i32,
            #[diesel(sql_type = Integer, column_name = "rating_deviation")]
            rating_deviation: i32,
            #[diesel(sql_type = Integer, column_name = "popularity")]
            popularity: i32,
            #[diesel(sql_type = Integer, column_name = "nb_plays")]
            nb_plays: i32,
            #[diesel(sql_type = Nullable<Text>, column_name = "themes")]
            themes: Option<String>,
            #[diesel(sql_type = Nullable<Text>, column_name = "game_url")]
            game_url: Option<String>,
            #[diesel(sql_type = Nullable<Text>, column_name = "opening_tags")]
            opening_tags: Option<String>,
        }
        
        // Build the query using raw SQL for maximum performance
        let mut query_parts = Vec::new();
        query_parts.push("SELECT DISTINCT p.* FROM puzzles p".to_string());
        
        let mut join_clauses = Vec::new();
        let mut where_clauses = Vec::new();
        
        where_clauses.push(format!("p.rating >= {} AND p.rating <= {}", min_rating, max_rating));
        
        // Add theme filtering with JOIN
        if let Some(themes_list) = themes {
            if !themes_list.is_empty() {
                join_clauses.push("INNER JOIN puzzle_themes pt ON p.id = pt.puzzle_id".to_string());
                let theme_placeholders: Vec<String> = themes_list.iter()
                    .map(|t| format!("'{}'", t.replace("'", "''")))
                    .collect();
                where_clauses.push(format!("pt.theme IN ({})", theme_placeholders.join(", ")));
            }
        }
        
        // Add opening_tag filtering with JOIN
        if let Some(tags_list) = opening_tags {
            if !tags_list.is_empty() {
                join_clauses.push("INNER JOIN puzzle_opening_tags pot ON p.id = pot.puzzle_id".to_string());
                let tag_placeholders: Vec<String> = tags_list.iter()
                    .map(|t| format!("'{}'", t.replace("'", "''")))
                    .collect();
                where_clauses.push(format!("pot.opening_tag IN ({})", tag_placeholders.join(", ")));
            }
        }
        
        // Build final query
        let mut sql_query_str = query_parts.join(" ");
        if !join_clauses.is_empty() {
            sql_query_str.push_str(" ");
            sql_query_str.push_str(&join_clauses.join(" "));
        }
        sql_query_str.push_str(" WHERE ");
        sql_query_str.push_str(&where_clauses.join(" AND "));
        
        // Optimize random selection: instead of ORDER BY RANDOM() which is slow,
        // we'll get a larger sample and randomly select from it, or use a more efficient method
        if random {
            // Get count first for efficient random selection
            let count_query = format!("SELECT COUNT(DISTINCT p.id) as count FROM puzzles p {} WHERE {}", 
                join_clauses.join(" "), 
                where_clauses.join(" AND "));
            
            let count_result: Vec<CountResult> = sql_query(&count_query).load(db)?;
            let total_count = count_result.first().map(|r| r.count).unwrap_or(0) as usize;
            
            if total_count == 0 {
                return Ok(Vec::new());
            }
            
            // Use a more efficient random selection: get a random offset
            let random_offset = if total_count > self.cache_size {
                let mut rng = rand::thread_rng();
                (rng.gen::<usize>() % (total_count - self.cache_size.min(total_count))) as i64
            } else {
                0
            };
            
            sql_query_str.push_str(&format!(" ORDER BY p.id LIMIT {} OFFSET {}", self.cache_size, random_offset));
        } else {
            sql_query_str.push_str(" ORDER BY p.id, p.rating LIMIT ");
            sql_query_str.push_str(&self.cache_size.to_string());
        }
        
        // Execute query and convert to Puzzle
        let puzzle_rows: Vec<PuzzleRow> = sql_query(&sql_query_str).load(db)?;
        let puzzles: Vec<Puzzle> = puzzle_rows.into_iter().map(|row| Puzzle {
            id: row.id,
            fen: row.fen,
            moves: row.moves,
            rating: row.rating,
            rating_deviation: row.rating_deviation,
            popularity: row.popularity,
            nb_plays: row.nb_plays,
            themes: row.themes,
            game_url: row.game_url,
            opening_tags: row.opening_tags,
        }).collect();
        
        // If random, shuffle the results
        if random && !puzzles.is_empty() {
            use rand::seq::SliceRandom;
            let mut rng = rand::thread_rng();
            let mut shuffled = puzzles;
            shuffled.shuffle(&mut rng);
            Ok(shuffled)
        } else {
            Ok(puzzles)
        }
    }

    /// Loads puzzles into the cache if needed
    ///
    /// This method will reload the cache if:
    /// - The cache is empty
    /// - The rating filters have changed
    /// - We've reached the end of the current cache
    ///
    /// # Arguments
    /// * `file` - Path to the puzzle database
    /// * `min_rating` - Minimum puzzle rating to include
    /// * `max_rating` - Maximum puzzle rating to include
    /// * `random` - Randomize puzzle in cache
    /// * `themes` - Optional themes filter

    /// Loads puzzles into the cache with optional theme and opening tag filters
    fn get_puzzles_with_filters(
        &mut self,
        file: &str,
        min_rating: u16,
        max_rating: u16,
        random: bool,
        themes: Option<Vec<String>>,
        opening_tags: Option<Vec<String>>,
    ) -> Result<(), Error> {
        // Check if we need to reload the cache
        let themes_changed = self.themes != themes;
        let opening_tags_changed = self.opening_tags != opening_tags;
        
        if self.cache.is_empty()
            || self.min_rating != min_rating
            || self.max_rating != max_rating
            || self.random != random
            || themes_changed
            || opening_tags_changed
            || self.counter >= self.cache_size
        {
            self.cache.clear();
            self.counter = 0;

            let mut db = diesel::SqliteConnection::establish(file)?;
            
            // Check if migration is needed first (only migrate if tables don't exist)
            let needs_migration = {
                use diesel::sql_query;
                use diesel::prelude::*;
                #[derive(QueryableByName)]
                struct CountResult {
                    #[diesel(sql_type = diesel::sql_types::BigInt, column_name = "count")]
                    count: i64,
                }
                let result: Vec<CountResult> = sql_query(
                    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('puzzle_themes', 'puzzle_opening_tags')"
                ).load(&mut db).unwrap_or_default();
                result.first().map(|r| r.count).unwrap_or(0) < 2
            };
            
            if needs_migration {
                // Only migrate if tables don't exist
                let db_path = PathBuf::from(file);
                let _ = migrate_puzzle_database_to_normalized(&db_path);
                // Re-establish connection after migration
                db = diesel::SqliteConnection::establish(file)?;
            }
            
            // Check if normalized tables exist (for new databases or after migration)
            let has_normalized_tables = {
                use diesel::sql_query;
                use diesel::prelude::*;
                #[derive(QueryableByName)]
                struct CountResult {
                    #[diesel(sql_type = diesel::sql_types::BigInt, column_name = "count")]
                    count: i64,
                }
                let result: Vec<CountResult> = sql_query(
                    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('puzzle_themes', 'puzzle_opening_tags')"
                ).load(&mut db).unwrap_or_default();
                result.first().map(|r| r.count).unwrap_or(0) == 2
            };
            
            let new_puzzles = if has_normalized_tables && (themes.is_some() || opening_tags.is_some()) {
                // Use optimized JOIN-based queries with normalized tables
                self.get_puzzles_with_normalized_tables(
                    &mut db,
                    min_rating,
                    max_rating,
                    random,
                    themes.as_ref(),
                    opening_tags.as_ref(),
                )?
            } else {
                // Fallback to old LIKE-based queries for databases without normalized tables
                let mut query = puzzles::table
                    .filter(puzzles::rating.le(max_rating as i32))
                    .filter(puzzles::rating.ge(min_rating as i32))
                    .into_boxed();

                // Apply themes filter if provided
                if let Some(ref themes_list) = themes {
                    if !themes_list.is_empty() {
                        let or_clauses: Vec<String> = themes_list.iter()
                            .map(|theme| {
                                let escaped_theme = theme.replace("'", "''");
                                format!(
                                    "(themes LIKE '% {} %' OR themes LIKE '{} %' OR themes LIKE '% {}' OR themes = '{}')",
                                    escaped_theme, escaped_theme, escaped_theme, escaped_theme
                                )
                            })
                            .collect();
                        let sql_condition = format!("themes IS NOT NULL AND ({})", or_clauses.join(" OR "));
                        query = query.filter(sql::<Bool>(&sql_condition));
                    }
                }

                // Apply opening_tags filter if provided
                if let Some(ref tags_list) = opening_tags {
                    if !tags_list.is_empty() {
                        let or_clauses: Vec<String> = tags_list.iter()
                            .map(|tag| {
                                let escaped_tag = tag.replace("'", "''");
                                format!(
                                    "(opening_tags LIKE '{} %' OR opening_tags = '{}')",
                                    escaped_tag, escaped_tag
                                )
                            })
                            .collect();
                        let sql_condition = format!("opening_tags IS NOT NULL AND ({})", or_clauses.join(" OR "));
                        query = query.filter(sql::<Bool>(&sql_condition));
                    }
                }

                if random {
                    query
                        .order(sql::<Bool>("RANDOM()"))
                        .limit(self.cache_size as i64)
                        .load::<Puzzle>(&mut db)?
                } else {
                    query
                        .order(puzzles::id.asc())
                        .order(puzzles::rating.asc())
                        .limit(self.cache_size as i64)
                        .load::<Puzzle>(&mut db)?
                }
            };

            self.cache = new_puzzles.into_iter().collect();
            self.min_rating = min_rating;
            self.max_rating = max_rating;
            self.random = random;
            self.themes = themes;
            self.opening_tags = opening_tags;
        }

        Ok(())
    }

    /// Gets the next puzzle from the cache
    ///
    /// # Returns
    /// * `Some(&Puzzle)` if a puzzle is available
    /// * `None` if no more puzzles are available in the cache
    fn get_next_puzzle(&mut self) -> Option<&Puzzle> {
        if let Some(puzzle) = self.cache.get(self.counter) {
            self.counter += 1;
            Some(puzzle)
        } else {
            None
        }
    }
}

/// Gets a random puzzle from the database within the specified rating range
///
/// This function uses a cache to avoid repeated database queries. The cache is
/// refreshed when it's empty, when the rating range changes, or when all puzzles
/// in the cache have been used.
///
/// # Arguments
/// * `file` - Path to the puzzle database
/// * `min_rating` - Minimum puzzle rating to include
/// * `max_rating` - Maximum puzzle rating to include
/// * `random` - Randomize puzzle in cache
/// * `themes` - Optional list of themes to filter by (puzzle must contain at least one)
/// * `opening_tags` - Optional list of opening tags to filter by (puzzle must contain at least one)
///
/// # Returns
/// * `Ok(Puzzle)` if a puzzle was found
/// * `Err(Error::NoPuzzles)` if no puzzles match the criteria
/// * Other errors if there was a problem accessing the database
#[tauri::command]
#[specta::specta]
pub fn get_puzzle(
    file: String,
    min_rating: u16,
    max_rating: u16,
    random: bool,
    themes: Option<Vec<String>>,
    opening_tags: Option<Vec<String>>,
) -> Result<Puzzle, Error> {
    static PUZZLE_CACHE: Lazy<Mutex<PuzzleCache>> = Lazy::new(|| Mutex::new(PuzzleCache::new()));

    let mut cache = PUZZLE_CACHE
        .lock()
        .map_err(|e| Error::MutexLockFailed(format!("Failed to lock puzzle cache: {}", e)))?;
    cache.get_puzzles_with_filters(&file, min_rating, max_rating, random, themes, opening_tags)?;
    // Get a reference to the next puzzle and clone it only if found
    match cache.get_next_puzzle() {
        Some(puzzle) => Ok(puzzle.clone()),
        None => Err(Error::NoPuzzles),
    }
}

/// Checks if a puzzle database has the themes and opening_tags columns
///
/// # Arguments
/// * `file` - Path to the puzzle database
///
/// # Returns
/// * `Ok((has_themes, has_opening_tags))` indicating which columns exist
/// * `Err(Error)` if there was a problem accessing the database
#[allow(dead_code)] // Used by frontend via Tauri commands
#[tauri::command]
#[specta::specta]
pub fn check_puzzle_db_columns(file: String) -> Result<(bool, bool), Error> {
    // Verify the file exists before trying to open it
    let file_path = std::path::Path::new(&file);
    if !file_path.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Puzzle database file does not exist: {}", file_path.display()),
        )));
    }
    
    // Verify the file is not empty
    let metadata = file_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Puzzle database file is empty: {}", file_path.display()),
        )));
    }
    
    let mut db = diesel::SqliteConnection::establish(&file)?;
    
    // Use PRAGMA table_info to check if columns exist
    use diesel::sql_query;
    use diesel::prelude::*;
    
    #[derive(QueryableByName)]
    struct ColumnInfo {
        #[diesel(sql_type = diesel::sql_types::Text, column_name = "name")]
        name: String,
    }
    
    let columns: Vec<ColumnInfo> = sql_query("PRAGMA table_info(puzzles)")
        .load(&mut db)?;
    
    let has_themes = columns.iter().any(|col| col.name == "themes");
    let has_opening_tags = columns.iter().any(|col| col.name == "opening_tags");
    
    Ok((has_themes, has_opening_tags))
}

/// Theme option with technical value and friendly label
#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeOption {
    pub value: String,
    pub label: String,
}

/// Theme group containing a category name and its themes
#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeGroup {
    pub group: String,
    pub items: Vec<ThemeOption>,
}

/// Gets the category/group for a theme
fn get_theme_category(theme: &str) -> &'static str {
    let theme_lower = theme.to_lowercase();
    
    // Mate patterns
    if theme_lower.contains("mate") || theme_lower == "zugzwang" {
        return "Mate Patterns";
    }
    
    // Tactics
    if matches!(
        theme_lower.as_str(),
        "fork" | "pin" | "skewer" | "deflection" | "discoveredattack" | "x-rayattack" 
        | "interference" | "intermezzo" | "capturingdefender" | "hangingpiece" 
        | "trappedpiece" | "doublecheck" | "doublestake" | "exposedking"
    ) {
        return "Tactics";
    }
    
    // Endgames
    if theme_lower.contains("endgame") || theme_lower == "endgame" {
        return "Endgames";
    }
    
    // Strategy
    if matches!(
        theme_lower.as_str(),
        "advantage" | "equality" | "crushing" | "defensive" | "queensideattack"
    ) {
        return "Strategy";
    }
    
    // Special Moves
    if matches!(
        theme_lower.as_str(),
        "castling" | "enpassant" | "promotion" | "underpromotion"
    ) {
        return "Special Moves";
    }
    
    // Game Phases
    if matches!(
        theme_lower.as_str(),
        "opening" | "middlegame" | "endgame"
    ) {
        return "Game Phases";
    }
    
    // Puzzle Length
    if matches!(
        theme_lower.as_str(),
        "short" | "long" | "verylong" | "one-move"
    ) {
        return "Puzzle Length";
    }
    
    // Default category
    "Other"
}

/// Opening tag option with technical value and friendly label
#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpeningTagOption {
    pub value: String,
    pub label: String,
}

/// Gets distinct values for themes from a puzzle database
/// OPTIMIZED: Uses normalized table if available, otherwise falls back to old method
///
/// # Arguments
/// * `file` - Path to the puzzle database
///
/// # Returns
/// * `Ok(Vec<ThemeOption>)` with distinct theme values and their friendly names
/// * `Err(Error)` if there was a problem accessing the database
#[allow(dead_code)] // Used by frontend via Tauri commands
#[tauri::command]
#[specta::specta]
pub fn get_puzzle_themes(file: String) -> Result<Vec<ThemeGroup>, Error> {
    // Verify the file exists before trying to open it
    let file_path = std::path::Path::new(&file);
    if !file_path.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Puzzle database file does not exist: {}", file_path.display()),
        )));
    }
    
    // Verify the file is not empty
    let metadata = file_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Puzzle database file is empty: {}", file_path.display()),
        )));
    }
    
    let mut db = diesel::SqliteConnection::establish(&file)?;
    
    // First check if themes column exists
    let (has_themes, _) = check_puzzle_db_columns(file.clone())?;
    if !has_themes {
        return Ok(Vec::new());
    }
    
    // Check if normalized table exists (much faster)
    use diesel::sql_query;
    use diesel::prelude::*;
    #[derive(QueryableByName)]
    struct CountResult {
        #[diesel(sql_type = diesel::sql_types::BigInt, column_name = "count")]
        count: i64,
    }
    let result: Vec<CountResult> = sql_query(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='puzzle_themes'"
    ).load(&mut db).unwrap_or_default();
    
    if result.first().map(|r| r.count).unwrap_or(0) > 0 {
        // Use normalized table - MUCH faster!
        // Check if friendly_name column exists
        #[derive(QueryableByName)]
        struct ColumnInfo {
            #[diesel(sql_type = diesel::sql_types::Text, column_name = "name")]
            name: String,
        }
        let columns: Vec<ColumnInfo> = sql_query("PRAGMA table_info(puzzle_themes)")
            .load(&mut db).unwrap_or_default();
        let has_friendly_name = columns.iter().any(|col| col.name == "friendly_name");
        
        if has_friendly_name {
            #[derive(QueryableByName)]
            struct ThemeRow {
                #[diesel(sql_type = diesel::sql_types::Text, column_name = "theme")]
                theme: String,
                #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>, column_name = "friendly_name")]
                friendly_name: Option<String>,
            }
            let themes: Vec<ThemeRow> = sql_query("SELECT DISTINCT theme, friendly_name FROM puzzle_themes ORDER BY COALESCE(friendly_name, theme)")
                .load(&mut db)?;
            // Group themes by category
            let mut grouped: HashMap<String, Vec<ThemeOption>> = HashMap::new();
            for r in themes {
                let category = get_theme_category(&r.theme).to_string();
                let option = ThemeOption {
                    value: r.theme.clone(),
                    label: r.friendly_name.unwrap_or_else(|| get_theme_friendly_name(&r.theme)),
                };
                grouped.entry(category).or_insert_with(Vec::new).push(option);
            }
            // Convert to sorted ThemeGroup vector
            let mut groups: Vec<ThemeGroup> = grouped.into_iter()
                .map(|(group, mut items)| {
                    items.sort_by(|a, b| a.label.cmp(&b.label));
                    ThemeGroup { group, items }
                })
                .collect();
            groups.sort_by(|a, b| a.group.cmp(&b.group));
            return Ok(groups);
        } else {
            #[derive(QueryableByName)]
            struct ThemeRow {
                #[diesel(sql_type = diesel::sql_types::Text, column_name = "theme")]
                theme: String,
            }
            let themes: Vec<ThemeRow> = sql_query("SELECT DISTINCT theme FROM puzzle_themes ORDER BY theme")
                .load(&mut db)?;
            // Group themes by category
            let mut grouped: HashMap<String, Vec<ThemeOption>> = HashMap::new();
            for r in themes {
                let category = get_theme_category(&r.theme).to_string();
                let option = ThemeOption {
                    value: r.theme.clone(),
                    label: get_theme_friendly_name(&r.theme),
                };
                grouped.entry(category).or_insert_with(Vec::new).push(option);
            }
            // Convert to sorted ThemeGroup vector
            let mut groups: Vec<ThemeGroup> = grouped.into_iter()
                .map(|(group, mut items)| {
                    items.sort_by(|a, b| a.label.cmp(&b.label));
                    ThemeGroup { group, items }
                })
                .collect();
            groups.sort_by(|a, b| a.group.cmp(&b.group));
            return Ok(groups);
        }
    }
    
    // Fallback to old method for databases without normalized tables
    let themes: Vec<Option<String>> = puzzles::table
        .select(puzzles::themes)
        .filter(puzzles::themes.is_not_null())
        .load(&mut db)?;
    
    let mut unique_themes = std::collections::HashSet::new();
    for theme_opt in themes {
        if let Some(theme_str) = theme_opt {
            for theme in theme_str.split_whitespace() {
                let trimmed = theme.trim().to_string();
                if !trimmed.is_empty() {
                    unique_themes.insert(trimmed);
                }
            }
        }
    }
    
    // Group themes by category
    let mut grouped: HashMap<String, Vec<ThemeOption>> = HashMap::new();
    for theme in unique_themes {
        let category = get_theme_category(&theme).to_string();
        let option = ThemeOption {
            value: theme.clone(),
            label: get_theme_friendly_name(&theme),
        };
        grouped.entry(category).or_insert_with(Vec::new).push(option);
    }
    // Convert to sorted ThemeGroup vector
    let mut groups: Vec<ThemeGroup> = grouped.into_iter()
        .map(|(group, mut items)| {
            items.sort_by(|a, b| a.label.cmp(&b.label));
            ThemeGroup { group, items }
        })
        .collect();
    groups.sort_by(|a, b| a.group.cmp(&b.group));
    Ok(groups)
}

/// Gets distinct values for opening_tags from a puzzle database
/// OPTIMIZED: Uses normalized table if available, otherwise falls back to old method
///
/// # Arguments
/// * `file` - Path to the puzzle database
///
/// # Returns
/// * `Ok(Vec<OpeningTagOption>)` with distinct opening tag values and their friendly names
/// * `Err(Error)` if there was a problem accessing the database
#[allow(dead_code)] // Used by frontend via Tauri commands
#[tauri::command]
#[specta::specta]
pub fn get_puzzle_opening_tags(file: String) -> Result<Vec<OpeningTagOption>, Error> {
    // Verify the file exists before trying to open it
    let file_path = std::path::Path::new(&file);
    if !file_path.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Puzzle database file does not exist: {}", file_path.display()),
        )));
    }
    
    // Verify the file is not empty
    let metadata = file_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Puzzle database file is empty: {}", file_path.display()),
        )));
    }
    
    let mut db = diesel::SqliteConnection::establish(&file)?;
    
    // First check if opening_tags column exists
    let (_, has_opening_tags) = check_puzzle_db_columns(file.clone())?;
    if !has_opening_tags {
        return Ok(Vec::new());
    }
    
    // Check if normalized table exists (much faster)
    use diesel::sql_query;
    use diesel::prelude::*;
    #[derive(QueryableByName)]
    struct CountResult {
        #[diesel(sql_type = diesel::sql_types::BigInt, column_name = "count")]
        count: i64,
    }
    let result: Vec<CountResult> = sql_query(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='puzzle_opening_tags'"
    ).load(&mut db).unwrap_or_default();
    
    if result.first().map(|r| r.count).unwrap_or(0) > 0 {
        // Use normalized table - MUCH faster!
        // Check if friendly_name column exists
        #[derive(QueryableByName)]
        struct ColumnInfo {
            #[diesel(sql_type = diesel::sql_types::Text, column_name = "name")]
            name: String,
        }
        let columns: Vec<ColumnInfo> = sql_query("PRAGMA table_info(puzzle_opening_tags)")
            .load(&mut db).unwrap_or_default();
        let has_friendly_name = columns.iter().any(|col| col.name == "friendly_name");
        
        if has_friendly_name {
            #[derive(QueryableByName)]
            struct TagRow {
                #[diesel(sql_type = diesel::sql_types::Text, column_name = "opening_tag")]
                opening_tag: String,
                #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>, column_name = "friendly_name")]
                friendly_name: Option<String>,
            }
            let tags: Vec<TagRow> = sql_query("SELECT DISTINCT opening_tag, friendly_name FROM puzzle_opening_tags ORDER BY COALESCE(friendly_name, opening_tag)")
                .load(&mut db)?;
            // Return both value (technical) and label (friendly name)
            return Ok(tags.into_iter().map(|r| OpeningTagOption {
                value: r.opening_tag.clone(),
                label: r.friendly_name.unwrap_or_else(|| get_opening_tag_friendly_name(&r.opening_tag)),
            }).collect());
        } else {
            #[derive(QueryableByName)]
            struct TagRow {
                #[diesel(sql_type = diesel::sql_types::Text, column_name = "opening_tag")]
                opening_tag: String,
            }
            let tags: Vec<TagRow> = sql_query("SELECT DISTINCT opening_tag FROM puzzle_opening_tags ORDER BY opening_tag")
                .load(&mut db)?;
            return Ok(tags.into_iter().map(|r| OpeningTagOption {
                value: r.opening_tag.clone(),
                label: get_opening_tag_friendly_name(&r.opening_tag),
            }).collect());
        }
    }
    
    // Fallback to old method for databases without normalized tables
    let opening_tags: Vec<Option<String>> = puzzles::table
        .select(puzzles::opening_tags)
        .filter(puzzles::opening_tags.is_not_null())
        .load(&mut db)?;
    
    let mut unique_tags = std::collections::HashSet::new();
    for tag_opt in opening_tags {
        if let Some(tag_str) = tag_opt {
            if let Some(first_word) = tag_str.split_whitespace().next() {
                let trimmed = first_word.trim().to_string();
                if !trimmed.is_empty() {
                    unique_tags.insert(trimmed);
                }
            }
        }
    }
    
    let mut result: Vec<OpeningTagOption> = unique_tags.into_iter().map(|tag| OpeningTagOption {
        value: tag.clone(),
        label: get_opening_tag_friendly_name(&tag),
    }).collect();
    result.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(result)
}

/// Gets the minimum and maximum rating range from a puzzle database
///
/// This function queries the database to find the lowest and highest puzzle ratings.
///
/// # Arguments
/// * `file` - Path to the puzzle database
///
/// # Returns
/// * `Ok((min_rating, max_rating))` with the rating range
/// * `Err(Error)` if there was a problem accessing the database
#[tauri::command]
#[specta::specta]
pub fn get_puzzle_rating_range(file: String) -> Result<(u16, u16), Error> {
    let mut db = diesel::SqliteConnection::establish(&file)?;
    
    let min_rating = puzzles::table
        .select(diesel::dsl::min(puzzles::rating))
        .first::<Option<i32>>(&mut db)?
        .unwrap_or(0) as u16;
    
    let max_rating = puzzles::table
        .select(diesel::dsl::max(puzzles::rating))
        .first::<Option<i32>>(&mut db)?
        .unwrap_or(0) as u16;
    
    Ok((min_rating, max_rating))
}

/// Information about a puzzle database
#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PuzzleDatabaseInfo {
    /// The title of the puzzle database (derived from filename)
    title: String,
    /// Description of the puzzle database (currently not populated)
    /// TODO: Consider adding a way to store and retrieve database descriptions
    description: String,
    /// Number of puzzles in the database
    puzzle_count: i32,
    /// Size of the database file in bytes
    storage_size: i64,
    /// Full path to the database file
    path: String,
}

/// Gets information about a puzzle database
///
/// This function retrieves metadata about a puzzle database, including:
/// - The title (derived from the filename)
/// - The number of puzzles in the database
/// - The size of the database file
/// - The full path to the database file
///
/// # Arguments
/// * `file` - Relative path to the puzzle database within the app's data directory
/// * `app` - Tauri app handle used to resolve the full path
///
/// # Returns
/// * `Ok(PuzzleDatabaseInfo)` with the database information
/// * `Err(Error)` if there was a problem accessing the database or file
#[tauri::command]
#[specta::specta]
pub async fn get_puzzle_db_info(
    file: PathBuf,
    app: tauri::AppHandle,
) -> Result<PuzzleDatabaseInfo, Error> {
    // Ensure we're working with a relative path by checking if it's absolute
    let file_path = if file.is_absolute() {
        // If it's already absolute, use it directly
        file
    } else {
        // Otherwise, resolve it relative to the db directory in AppData
        let db_path = PathBuf::from("puzzles").join(file);
        app.path().resolve(db_path, BaseDirectory::AppData)?
    };

    // Verify the file actually exists before trying to open it
    if !file_path.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Puzzle database file does not exist: {}", file_path.display()),
        )));
    }

    // Verify the file is not empty (SQLite files should be at least a few bytes)
    let metadata = file_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Puzzle database file is empty: {}", file_path.display()),
        )));
    }

    let mut db = diesel::SqliteConnection::establish(&file_path.to_string_lossy())?;

    // Check if the puzzles table exists and get count safely
    let puzzle_count = match puzzles::table.count().get_result::<i64>(&mut db) {
        Ok(count) => count as i32,
        Err(diesel::result::Error::DatabaseError(kind, info)) => {
            // Check if the error is related to missing table
            if info.message().contains("no such table") {
                // Table doesn't exist - this could be an uninitialized database file
                // For safety, we return 0 instead of auto-initializing
                0
            } else {
                // For other database errors, propagate them
                return Err(Error::from(diesel::result::Error::DatabaseError(kind, info)));
            }
        }
        Err(e) => {
            // For other errors, propagate them
            return Err(Error::from(e));
        }
    };

    let storage_size = file_path.metadata()?.len() as i64;
    let filename = file_path
        .file_name()
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Invalid path: no filename",
            )
        })?
        .to_string_lossy();

    Ok(PuzzleDatabaseInfo {
        title: filename.to_string(),
        description: "".to_string(),
        puzzle_count,
        storage_size,
        path: file_path.to_string_lossy().to_string(),
    })
}

/// Imports puzzles from a local file into a new puzzle database
///
/// This function can handle different types of puzzle files:
/// - PGN files containing puzzles (with FEN positions and solution moves)
/// - Existing puzzle database files (.db, .db3)
/// - Compressed files (.zst)
///
/// # Arguments
/// * `source_file` - Path to the source puzzle file
/// * `db_path` - Path where the new puzzle database should be created
/// * `title` - Title for the puzzle database
/// * `description` - Optional description for the puzzle database
/// * `app` - Tauri app handle for progress events
///
/// # Returns
/// * `Ok(())` if import was successful
/// * `Err(Error)` if there was a problem importing the file
#[tauri::command]
#[specta::specta]
pub async fn import_puzzle_file(
    source_file: PathBuf,
    db_path: PathBuf,
    title: String,
    description: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), Error> {
    let description = description.unwrap_or_default();
    
    // Check if source file exists
    if !source_file.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Source file not found",
        )));
    }

    // Create parent directory for the database if it doesn't exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Remove existing database file if it exists to avoid empty/corrupted files
    if db_path.exists() {
        std::fs::remove_file(&db_path).map_err(|e| {
            Error::IoError(std::io::Error::new(
                e.kind(),
                format!("Failed to remove existing database file '{}': {}", db_path.display(), e),
            ))
        })?;
    }

    // Check file extension and name to determine format
    let extension = source_file.extension().and_then(|ext| ext.to_str());
    let file_name = source_file.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    
    // Check if it's a CSV file (could be .csv or .csv.zst)
    let is_csv = file_name.ends_with(".csv") || file_name.ends_with(".csv.zst");
    
    match extension {
        Some("db") | Some("db3") => {
            // Copy existing puzzle database
            copy_puzzle_database(&source_file, &db_path, &title, &description).await
        }
        Some("pgn") => {
            // Parse PGN file and extract puzzles
            import_puzzles_from_pgn(&source_file, &db_path, &title, &description, &app).await
        }
        Some("zst") => {
            // Handle compressed files - check if it's CSV or PGN
            if is_csv {
                import_puzzles_from_csv_compressed(&source_file, &db_path, &title, &description, &app).await
            } else {
                import_puzzles_from_compressed(&source_file, &db_path, &title, &description, &app).await
            }
        }
        Some("csv") => {
            // Handle uncompressed CSV files
            import_puzzles_from_csv(&source_file, &db_path, &title, &description, &app).await
        }
        _ => Err(Error::UnsupportedFileFormat(format!(
            "Unsupported file format: {:?}",
            extension
        ))),
    }
}

/// Validates that a file is a valid SQLite database
fn validate_sqlite_database(file_path: &PathBuf) -> Result<(), Error> {
    // Verify the file exists
    if !file_path.exists() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("File does not exist: {}", file_path.display()),
        )));
    }
    
    // Verify the file is not empty
    let metadata = file_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Database file is empty: {}", file_path.display()),
        )));
    }
    
    // First, try to open it as a SQLite database - this is the most reliable check
    // If Diesel can open it, it's valid
    match diesel::SqliteConnection::establish(&file_path.to_string_lossy()) {
        Ok(_) => {
            // Successfully opened, it's a valid SQLite database
            return Ok(());
        }
        Err(e) => {
            // If opening fails, check the header to provide better error messages
            let mut file = File::open(file_path)?;
            let mut header = [0u8; 16];
            
            // Try to read the header
            if let Ok(_) = file.read_exact(&mut header) {
                // SQLite database files start with "SQLite format 3\000" (16 bytes)
                // Using explicit array to ensure correct size
                let sqlite_magic: [u8; 16] = [
                    b'S', b'Q', b'L', b'i', b't', b'e', b' ', b'f', 
                    b'o', b'r', b'm', b'a', b't', b' ', b'3', 0u8
                ];
                
                // Check if header matches
                if header == sqlite_magic {
                    // Header matches but Diesel can't open it - might be corrupted or locked
                    return Err(Error::UnsupportedFileFormat(format!(
                        "File has correct SQLite header but cannot be opened as a database. This may indicate the file is corrupted, locked, or in use. Error: {}",
                        e
                    )));
                } else {
                    // Header doesn't match - check if it's HTML or other format
                    let header_str = String::from_utf8_lossy(&header);
                    if header_str.trim_start().starts_with("<!DOCTYPE") 
                        || header_str.trim_start().starts_with("<html")
                        || header_str.trim_start().starts_with("<!doctype")
                        || header_str.trim_start().starts_with("<HTML") {
                        // Read more of the file to get better diagnostic info
                        file.seek(SeekFrom::Start(0))?;
                        let mut sample = vec![0u8; 512.min(metadata.len() as usize)];
                        file.read_exact(&mut sample[..])?;
                        let sample_str = String::from_utf8_lossy(&sample);
                        
                        return Err(Error::UnsupportedFileFormat(format!(
                            "Downloaded file appears to be an HTML page ({} bytes), not a database file. Please verify the link allows direct download. First 200 chars: {}",
                            metadata.len(),
                            sample_str.chars().take(200).collect::<String>()
                        )));
                    }
                    
                    // Read first 32 bytes for better debugging
                    file.seek(SeekFrom::Start(0))?;
                    let mut extended_header = vec![0u8; 32.min(metadata.len() as usize)];
                    if extended_header.len() > 0 {
                        file.read_exact(&mut extended_header[..])?;
                    }
                    
                    let header_hex: String = extended_header.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" ");
                    let expected_hex: String = sqlite_magic.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" ");
                    
                    return Err(Error::UnsupportedFileFormat(format!(
                        "File is not a valid SQLite database. Expected SQLite format, but file header does not match.\nFile size: {} bytes.\nExpected header (hex): {}\nActual header (hex): {}\nDiesel error: {}\nFile may be corrupted or in wrong format.",
                        metadata.len(),
                        expected_hex,
                        header_hex,
                        e
                    )));
                }
            }
            
            // If we can't even read the header, return the Diesel error
            return Err(Error::UnsupportedFileFormat(format!(
                "Cannot open file as SQLite database. Error: {}",
                e
            )));
        }
    }
}

/// Copies an existing puzzle database to a new location
async fn copy_puzzle_database(
    source_file: &PathBuf,
    db_path: &PathBuf,
    _title: &str,
    _description: &str,
) -> Result<(), Error> {
    // Validate the source file before copying
    validate_sqlite_database(source_file)?;
    
    // Copy the source database file to the destination path
    std::fs::copy(source_file, db_path)
        .map_err(|e| Error::IoError(std::io::Error::new(e.kind(), format!("Failed to copy database: {}", e))))?;
    Ok(())
}

/// Validates a downloaded puzzle database file
#[tauri::command]
#[specta::specta]
pub async fn validate_puzzle_database(file: PathBuf) -> Result<bool, Error> {
    validate_sqlite_database(&file)?;
    Ok(true)
}

/// Imports puzzles from a PGN file
async fn import_puzzles_from_pgn(
    source_file: &PathBuf,
    db_path: &PathBuf,
    title: &str,
    description: &str,
    app: &tauri::AppHandle,
) -> Result<(), Error> {
    // Create the puzzle database
    create_puzzle_database(db_path, title, description)?;
    
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Read and parse PGN file with better error handling
    let file = File::open(source_file).map_err(|e| {
        Error::IoError(std::io::Error::new(
            e.kind(),
            format!("Failed to open file '{}': {}", source_file.display(), e),
        ))
    })?;
    
    let puzzles = parse_puzzles_from_pgn(file).map_err(|e| {
        Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to parse puzzles from '{}': {}", source_file.display(), e),
        ))
    })?;
    
    if puzzles.is_empty() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("No valid puzzles found in file '{}'", source_file.display()),
        )));
    }
    
    // Insert puzzles into database in batches
    let batch_size = 1000;
    let total_puzzles = puzzles.len();
    
    for (i, chunk) in puzzles.chunks(batch_size).enumerate() {
        db.transaction::<_, Error, _>(|db| {
            for puzzle in chunk {
                insert_into(puzzles::table)
                    .values(puzzle)
                    .execute(db)?;
            }
            Ok(())
        })?;
        
        // Emit progress event
        let processed = ((i + 1) * batch_size).min(total_puzzles);
        let _ = app.emit("import_puzzle_progress", (processed, total_puzzles));
    }
    
    Ok(())
}

/// Imports puzzles from a compressed file (PGN format)
async fn import_puzzles_from_compressed(
    source_file: &PathBuf,
    db_path: &PathBuf,
    title: &str,
    description: &str,
    app: &tauri::AppHandle,
) -> Result<(), Error> {
    // Create the puzzle database
    create_puzzle_database(db_path, title, description)?;
    
    let file = File::open(source_file).map_err(|e| {
        Error::IoError(std::io::Error::new(
            e.kind(),
            format!("Failed to open compressed file '{}': {}", source_file.display(), e),
        ))
    })?;
    
    let decoder = zstd::Decoder::new(file).map_err(|e| {
        Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to decompress file '{}': {}", source_file.display(), e),
        ))
    })?;
    
    let puzzles = parse_puzzles_from_pgn(decoder).map_err(|e| {
        Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to parse puzzles from compressed file '{}': {}", source_file.display(), e),
        ))
    })?;
    
    if puzzles.is_empty() {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("No valid puzzles found in compressed file '{}'", source_file.display()),
        )));
    }
    
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Insert puzzles into database in batches
    let batch_size = 1000;
    let total_puzzles = puzzles.len();
    
    for (i, chunk) in puzzles.chunks(batch_size).enumerate() {
        db.transaction::<_, Error, _>(|db| {
            for puzzle in chunk {
                insert_into(puzzles::table)
                    .values(puzzle)
                    .execute(db)?;
            }
            Ok(())
        })?;
        
        // Emit progress event
        let processed = ((i + 1) * batch_size).min(total_puzzles);
        let _ = app.emit("import_puzzle_progress", (processed, total_puzzles));
    }
    
    Ok(())
}

/// Imports puzzles from a CSV file
/// Uses streaming processing for better performance with large files
async fn import_puzzles_from_csv(
    source_file: &PathBuf,
    db_path: &PathBuf,
    title: &str,
    description: &str,
    app: &tauri::AppHandle,
) -> Result<(), Error> {
    // Create the database first (without indexes for faster insertion)
    create_puzzle_database(db_path, title, description)?;
    
    // Use a guard to clean up the database file if insertion fails
    let result = (|| -> Result<(), Error> {
        let file = File::open(source_file).map_err(|e| {
            Error::IoError(std::io::Error::new(
                e.kind(),
                format!("Failed to open CSV file '{}': {}", source_file.display(), e),
            ))
        })?;
        
        let reader = BufReader::with_capacity(1024 * 1024, file); // 1MB buffer
        let mut csv_reader = ReaderBuilder::new()
            .has_headers(true)
            .from_reader(reader);
        
        let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
        
        // Apply additional performance optimizations
        db.batch_execute("PRAGMA journal_mode = WAL;")?;
        db.batch_execute("PRAGMA synchronous = NORMAL;")?;
        db.batch_execute("PRAGMA cache_size = -128000;")?; // 128MB cache for bulk insert
        db.batch_execute("PRAGMA temp_store = MEMORY;")?;
        db.batch_execute("PRAGMA mmap_size = 536870912;")?; // 512MB for bulk operations
        
        // Process puzzles in streaming batches
        let batch_size = 10000; // Increased from 1000 for better performance
        let mut batch = Vec::with_capacity(batch_size);
        let mut total_inserted = 0;
        let mut batch_count = 0;
        
        for result in csv_reader.deserialize() {
            let record: LichessPuzzleCsv = result.map_err(|e| {
                Error::IoError(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Failed to parse CSV record: {}", e),
                ))
            })?;
            
            // Skip puzzles with missing required fields
            if record.fen.is_empty() || record.moves.is_empty() {
                continue;
            }
            
            let puzzle = NewPuzzle {
                fen: record.fen,
                moves: record.moves,
                rating: record.rating.unwrap_or(1500),
                rating_deviation: record.rating_deviation.unwrap_or(350),
                popularity: record.popularity.unwrap_or(0),
                nb_plays: record.nb_plays.unwrap_or(0),
                themes: record.themes,
                game_url: record.game_url,
                opening_tags: record.opening_tags,
            };
            
            batch.push(puzzle);
            
            // Insert when batch is full
            if batch.len() >= batch_size {
                db.transaction::<_, Error, _>(|db| {
                    for puzzle in &batch {
                        insert_into(puzzles::table)
                            .values(puzzle)
                            .execute(db)?;
                    }
                    Ok(())
                })?;
                
                total_inserted += batch.len();
                batch_count += 1;
                
                // Emit progress event every 10 batches to avoid too many events
                if batch_count % 10 == 0 {
                    let _ = app.emit("import_puzzle_progress", (total_inserted, 0));
                }
                
                batch.clear();
            }
        }
        
        // Insert remaining puzzles
        if !batch.is_empty() {
            db.transaction::<_, Error, _>(|db| {
                for puzzle in &batch {
                    insert_into(puzzles::table)
                        .values(puzzle)
                        .execute(db)?;
                }
                Ok(())
            })?;
            total_inserted += batch.len();
        }
        
        if total_inserted == 0 {
            return Err(Error::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("No valid puzzles found in CSV file '{}'", source_file.display()),
            )));
        }
        
        // Emit final progress
        let _ = app.emit("import_puzzle_progress", (total_inserted, total_inserted));
        
        // Populate normalized tables for fast filtering
        populate_normalized_tables(db_path)?;
        
        // Create indexes AFTER all data is inserted (much faster)
        create_puzzle_indexes(db_path)?;
        
        Ok(())
    })();
    
    // If insertion failed, remove the empty database file
    if result.is_err() && db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }
    
    result
}

/// Imports puzzles from a compressed CSV file (.csv.zst)
/// Uses streaming processing for better performance with large files
async fn import_puzzles_from_csv_compressed(
    source_file: &PathBuf,
    db_path: &PathBuf,
    title: &str,
    description: &str,
    app: &tauri::AppHandle,
) -> Result<(), Error> {
    // Create the database first (without indexes for faster insertion)
    create_puzzle_database(db_path, title, description)?;
    
    // Use a guard to clean up the database file if insertion fails
    let result = (|| -> Result<(), Error> {
        let file = File::open(source_file).map_err(|e| {
            Error::IoError(std::io::Error::new(
                e.kind(),
                format!("Failed to open compressed CSV file '{}': {}", source_file.display(), e),
            ))
        })?;
        
        let decoder = zstd::Decoder::new(file).map_err(|e| {
            Error::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to decompress CSV file '{}': {}", source_file.display(), e),
            ))
        })?;
        
        let reader = BufReader::with_capacity(1024 * 1024, decoder); // 1MB buffer
        let mut csv_reader = ReaderBuilder::new()
            .has_headers(true)
            .from_reader(reader);
        
        let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
        
        // Apply additional performance optimizations
        db.batch_execute("PRAGMA journal_mode = WAL;")?;
        db.batch_execute("PRAGMA synchronous = NORMAL;")?;
        db.batch_execute("PRAGMA cache_size = -128000;")?; // 128MB cache for bulk insert
        db.batch_execute("PRAGMA temp_store = MEMORY;")?;
        db.batch_execute("PRAGMA mmap_size = 536870912;")?; // 512MB for bulk operations
        
        // Process puzzles in streaming batches
        let batch_size = 10000; // Increased from 1000 for better performance
        let mut batch = Vec::with_capacity(batch_size);
        let mut total_inserted = 0;
        let mut batch_count = 0;
        
        for result in csv_reader.deserialize() {
            let record: LichessPuzzleCsv = result.map_err(|e| {
                Error::IoError(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Failed to parse CSV record: {}", e),
                ))
            })?;
            
            // Skip puzzles with missing required fields
            if record.fen.is_empty() || record.moves.is_empty() {
                continue;
            }
            
            let puzzle = NewPuzzle {
                fen: record.fen,
                moves: record.moves,
                rating: record.rating.unwrap_or(1500),
                rating_deviation: record.rating_deviation.unwrap_or(350),
                popularity: record.popularity.unwrap_or(0),
                nb_plays: record.nb_plays.unwrap_or(0),
                themes: record.themes,
                game_url: record.game_url,
                opening_tags: record.opening_tags,
            };
            
            batch.push(puzzle);
            
            // Insert when batch is full
            if batch.len() >= batch_size {
                db.transaction::<_, Error, _>(|db| {
                    for puzzle in &batch {
                        insert_into(puzzles::table)
                            .values(puzzle)
                            .execute(db)?;
                    }
                    Ok(())
                })?;
                
                total_inserted += batch.len();
                batch_count += 1;
                
                // Emit progress event every 10 batches to avoid too many events
                if batch_count % 10 == 0 {
                    let _ = app.emit("import_puzzle_progress", (total_inserted, 0));
                }
                
                batch.clear();
            }
        }
        
        // Insert remaining puzzles
        if !batch.is_empty() {
            db.transaction::<_, Error, _>(|db| {
                for puzzle in &batch {
                    insert_into(puzzles::table)
                        .values(puzzle)
                        .execute(db)?;
                }
                Ok(())
            })?;
            total_inserted += batch.len();
        }
        
        if total_inserted == 0 {
            return Err(Error::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("No valid puzzles found in compressed CSV file '{}'", source_file.display()),
            )));
        }
        
        // Emit final progress
        let _ = app.emit("import_puzzle_progress", (total_inserted, total_inserted));
        
        // Populate normalized tables for fast filtering
        populate_normalized_tables(db_path)?;
        
        // Create indexes AFTER all data is inserted (much faster)
        create_puzzle_indexes(db_path)?;
        
        Ok(())
    })();
    
    // If insertion failed, remove the empty database file
    if result.is_err() && db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }
    
    result
}

/// Creates a new puzzle database with the proper schema
/// Note: Indexes are NOT created here - they should be created after bulk insert for better performance
fn create_puzzle_database(db_path: &PathBuf, _title: &str, _description: &str) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Load the schema from external SQL files
    const PUZZLES_TABLES: &str = include_str!("../../database/schema/puzzles_tables.sql");
    
    // Apply performance optimizations BEFORE creating tables
    db.batch_execute("PRAGMA journal_mode = WAL;")?;
    db.batch_execute("PRAGMA synchronous = NORMAL;")?;
    db.batch_execute("PRAGMA cache_size = -64000;")?; // 64MB cache
    db.batch_execute("PRAGMA temp_store = MEMORY;")?;
    db.batch_execute("PRAGMA mmap_size = 268435456;")?; // 256MB
    db.batch_execute("PRAGMA page_size = 4096;")?;
    
    // Create the puzzles table using the external schema
    db.batch_execute(PUZZLES_TABLES)?;
    
    // NOTE: Indexes are NOT created here - they will be created after bulk insert
    
    // Verify the database was created successfully by checking file size
    // SQLite databases should be at least a few KB after schema creation
    let metadata = db_path.metadata()?;
    if metadata.len() == 0 {
        return Err(Error::IoError(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Failed to create puzzle database: file is empty after schema creation"),
        )));
    }
    
    Ok(())
}

/// Populates normalized tables (puzzle_themes and puzzle_opening_tags) from puzzles table
/// This should be called after all puzzles are inserted but before creating indexes
fn populate_normalized_tables(db_path: &PathBuf) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Clear existing normalized data
    db.batch_execute("DELETE FROM puzzle_themes;")?;
    db.batch_execute("DELETE FROM puzzle_opening_tags;")?;
    
    // Get all puzzles with themes and opening_tags
    let puzzles_with_metadata: Vec<(i32, Option<String>, Option<String>)> = puzzles::table
        .select((puzzles::id, puzzles::themes, puzzles::opening_tags))
        .filter(
            puzzles::themes.is_not_null()
                .or(puzzles::opening_tags.is_not_null())
        )
        .load(&mut db)?;
    
    // Process in batches for better performance using prepared statements
    let batch_size = 500;
    let mut theme_batch = Vec::new();
    let mut tag_batch = Vec::new();
    
    for (puzzle_id, themes_opt, opening_tags_opt) in puzzles_with_metadata {
        // Process themes
        if let Some(themes_str) = themes_opt {
            if !themes_str.trim().is_empty() {
                for theme in themes_str.split_whitespace() {
                    let trimmed = theme.trim();
                    if !trimmed.is_empty() {
                        theme_batch.push((puzzle_id, trimmed.to_string()));
                    }
                }
            }
        }
        
        // Process opening_tags (only first word)
        if let Some(tags_str) = opening_tags_opt {
            if !tags_str.trim().is_empty() {
                if let Some(first_word) = tags_str.split_whitespace().next() {
                    let trimmed = first_word.trim();
                    if !trimmed.is_empty() {
                        tag_batch.push((puzzle_id, trimmed.to_string()));
                    }
                }
            }
        }
        
        // Insert batches when they reach the size limit
        if theme_batch.len() >= batch_size {
            db.transaction::<_, Error, _>(|db| {
                for (id, theme) in &theme_batch {
                    // Use INSERT with proper escaping
                    let escaped_theme = theme.replace("'", "''");
                    let friendly_name = get_theme_friendly_name(theme);
                    let escaped_friendly = friendly_name.replace("'", "''");
                    diesel::sql_query(&format!(
                        "INSERT INTO puzzle_themes (puzzle_id, theme, friendly_name) VALUES ({}, '{}', '{}')",
                        id, escaped_theme, escaped_friendly
                    )).execute(db)?;
                }
                Ok(())
            })?;
            theme_batch.clear();
        }
        
        if tag_batch.len() >= batch_size {
            db.transaction::<_, Error, _>(|db| {
                for (id, tag) in &tag_batch {
                    // Use INSERT with proper escaping
                    let escaped_tag = tag.replace("'", "''");
                    let friendly_name = get_opening_tag_friendly_name(tag);
                    let escaped_friendly = friendly_name.replace("'", "''");
                    diesel::sql_query(&format!(
                        "INSERT INTO puzzle_opening_tags (puzzle_id, opening_tag, friendly_name) VALUES ({}, '{}', '{}')",
                        id, escaped_tag, escaped_friendly
                    )).execute(db)?;
                }
                Ok(())
            })?;
            tag_batch.clear();
        }
    }
    
    // Insert remaining items
    if !theme_batch.is_empty() {
        db.transaction::<_, Error, _>(|db| {
            for (id, theme) in &theme_batch {
                let escaped_theme = theme.replace("'", "''");
                let friendly_name = get_theme_friendly_name(theme);
                let escaped_friendly = friendly_name.replace("'", "''");
                diesel::sql_query(&format!(
                    "INSERT INTO puzzle_themes (puzzle_id, theme, friendly_name) VALUES ({}, '{}', '{}')",
                    id, escaped_theme, escaped_friendly
                )).execute(db)?;
            }
            Ok(())
        })?;
    }
    
    if !tag_batch.is_empty() {
        db.transaction::<_, Error, _>(|db| {
            for (id, tag) in &tag_batch {
                let escaped_tag = tag.replace("'", "''");
                let friendly_name = get_opening_tag_friendly_name(tag);
                let escaped_friendly = friendly_name.replace("'", "''");
                diesel::sql_query(&format!(
                    "INSERT INTO puzzle_opening_tags (puzzle_id, opening_tag, friendly_name) VALUES ({}, '{}', '{}')",
                    id, escaped_tag, escaped_friendly
                )).execute(db)?;
            }
            Ok(())
        })?;
    }
    
    Ok(())
}

/// Creates indexes on the puzzle database after bulk insert
fn create_puzzle_indexes(db_path: &PathBuf) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    const PUZZLES_INDEXES: &str = include_str!("../../database/indexes/puzzles_indexes.sql");
    db.batch_execute(PUZZLES_INDEXES)?;
    Ok(())
}

/// Migrates an existing puzzle database to include normalized tables
/// This should be called once for databases created before the optimization
fn migrate_puzzle_database_to_normalized(db_path: &PathBuf) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Check if normalized tables already exist
    use diesel::sql_query;
    use diesel::prelude::*;
    #[derive(QueryableByName)]
    struct CountResult {
        #[diesel(sql_type = diesel::sql_types::BigInt, column_name = "count")]
        count: i64,
    }
    let result: Vec<CountResult> = sql_query(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('puzzle_themes', 'puzzle_opening_tags')"
    ).load(&mut db).unwrap_or_default();
    
    if result.first().map(|r| r.count).unwrap_or(0) == 2 {
        // Tables already exist, migration not needed
        return Ok(());
    }
    
    // Check if tables exist and what columns they have
    let existing_count: Vec<CountResult> = sql_query(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('puzzle_themes', 'puzzle_opening_tags')"
    ).load(&mut db).unwrap_or_default();
    
    // Create normalized tables if they don't exist
    if existing_count.first().map(|r| r.count).unwrap_or(0) == 0 {
        db.batch_execute(
            r#"
            CREATE TABLE IF NOT EXISTS puzzle_themes (
                puzzle_id INTEGER NOT NULL,
                theme TEXT NOT NULL,
                friendly_name TEXT,
                PRIMARY KEY (puzzle_id, theme),
                FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS puzzle_opening_tags (
                puzzle_id INTEGER NOT NULL,
                opening_tag TEXT NOT NULL,
                friendly_name TEXT,
                PRIMARY KEY (puzzle_id, opening_tag),
                FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE CASCADE
            );
            "#
        )?;
        
        // Populate normalized tables from existing data
        populate_normalized_tables(db_path)?;
    } else {
        // Tables exist, check if friendly_name column exists and add it if missing
        #[derive(QueryableByName)]
        struct ColumnInfo {
            #[diesel(sql_type = diesel::sql_types::Text, column_name = "name")]
            name: String,
        }
        
        // Check puzzle_themes
        let theme_columns: Vec<ColumnInfo> = sql_query("PRAGMA table_info(puzzle_themes)")
            .load(&mut db).unwrap_or_default();
        if !theme_columns.iter().any(|col| col.name == "friendly_name") {
            db.batch_execute("ALTER TABLE puzzle_themes ADD COLUMN friendly_name TEXT;")?;
        }
        
        // Check puzzle_opening_tags
        let tag_columns: Vec<ColumnInfo> = sql_query("PRAGMA table_info(puzzle_opening_tags)")
            .load(&mut db).unwrap_or_default();
        if !tag_columns.iter().any(|col| col.name == "friendly_name") {
            db.batch_execute("ALTER TABLE puzzle_opening_tags ADD COLUMN friendly_name TEXT;")?;
        }
        
        // Update existing records with friendly names
        // Get all distinct themes and update their friendly_name
        #[derive(QueryableByName)]
        struct ThemeRow {
            #[diesel(sql_type = diesel::sql_types::Text, column_name = "theme")]
            theme: String,
        }
        let themes: Vec<ThemeRow> = sql_query("SELECT DISTINCT theme FROM puzzle_themes WHERE friendly_name IS NULL")
            .load(&mut db)
            .unwrap_or_default();
        
        for theme_row in themes {
            let theme = theme_row.theme;
            let friendly_name = get_theme_friendly_name(&theme);
            let escaped_theme = theme.replace("'", "''");
            let escaped_friendly = friendly_name.replace("'", "''");
            let _ = db.batch_execute(&format!(
                "UPDATE puzzle_themes SET friendly_name = '{}' WHERE theme = '{}' AND friendly_name IS NULL",
                escaped_friendly, escaped_theme
            ));
        }
        
        // Get all distinct opening_tags and update their friendly_name
        #[derive(QueryableByName)]
        struct TagRow {
            #[diesel(sql_type = diesel::sql_types::Text, column_name = "opening_tag")]
            opening_tag: String,
        }
        let tags: Vec<TagRow> = sql_query("SELECT DISTINCT opening_tag FROM puzzle_opening_tags WHERE friendly_name IS NULL")
            .load(&mut db)
            .unwrap_or_default();
        
        for tag_row in tags {
            let tag = tag_row.opening_tag;
            let friendly_name = get_opening_tag_friendly_name(&tag);
            let escaped_tag = tag.replace("'", "''");
            let escaped_friendly = friendly_name.replace("'", "''");
            let _ = db.batch_execute(&format!(
                "UPDATE puzzle_opening_tags SET friendly_name = '{}' WHERE opening_tag = '{}' AND friendly_name IS NULL",
                escaped_friendly, escaped_tag
            ));
        }
    }
    
    // Create indexes if they don't exist
    db.batch_execute(
        r#"
        CREATE INDEX IF NOT EXISTS idx_puzzle_themes_puzzle_id ON puzzle_themes(puzzle_id);
        CREATE INDEX IF NOT EXISTS idx_puzzle_themes_theme ON puzzle_themes(theme);
        CREATE INDEX IF NOT EXISTS idx_puzzle_opening_tags_puzzle_id ON puzzle_opening_tags(puzzle_id);
        CREATE INDEX IF NOT EXISTS idx_puzzle_opening_tags_tag ON puzzle_opening_tags(opening_tag);
        CREATE INDEX IF NOT EXISTS idx_puzzles_rating_id ON puzzles(rating, id);
        "#
    )?;
    
    Ok(())
}

/// Ensures that a database file has the proper puzzle schema initialized
/// 
/// This function checks if the puzzles table exists and creates it if missing.
/// This is useful for validating and repairing database files that may be 
/// empty or corrupted.
/// 
/// # Arguments
/// * `db_path` - Path to the database file
/// 
/// # Returns
/// * `Ok(())` if the schema exists or was successfully created
/// * `Err(Error)` if there was a problem initializing the schema
#[allow(dead_code)]
fn ensure_puzzle_schema(db_path: &PathBuf) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Check if puzzles table exists by trying to query it
    match puzzles::table.count().get_result::<i64>(&mut db) {
        Ok(_) => {
            // Table exists and is queryable
            Ok(())
        }
        Err(diesel::result::Error::DatabaseError(kind, info)) => {
            // Check if the error is related to missing table
            if info.message().contains("no such table") {
                // Table doesn't exist, create it
                const PUZZLES_TABLES: &str = include_str!("../../database/schema/puzzles_tables.sql");
                const PUZZLES_INDEXES: &str = include_str!("../../database/indexes/puzzles_indexes.sql");
                
                db.batch_execute(PUZZLES_TABLES)?;
                db.batch_execute(PUZZLES_INDEXES)?;
                Ok(())
            } else {
                // Other database error
                Err(Error::from(diesel::result::Error::DatabaseError(kind, info)))
            }
        }
        Err(e) => {
            // Other database error
            Err(Error::from(e))
        }
    }
}

/// Parses puzzles from a PGN reader
fn parse_puzzles_from_pgn<R: Read>(mut reader: R) -> Result<Vec<NewPuzzle>, Error> {
    let mut puzzles = Vec::new();
    let mut current_puzzle = NewPuzzle::default();
    let mut in_puzzle = false;
    
    // Read all bytes and convert to string with lossy UTF-8 conversion
    let mut buffer = Vec::new();
    reader.read_to_end(&mut buffer)?;
    
    // Convert bytes to string, replacing invalid UTF-8 sequences with replacement characters
    let content = String::from_utf8_lossy(&buffer);
    
    for line in content.lines() {
        let line = line.trim();
        
        if line.is_empty() {
            if in_puzzle && current_puzzle.is_complete() {
                puzzles.push(current_puzzle);
                current_puzzle = NewPuzzle::default();
                in_puzzle = false;
            }
            continue;
        }
        
        if line.starts_with('[') && line.ends_with(']') {
            // Parse PGN headers
            if let Some((key, value)) = parse_pgn_header(line) {
                match key.as_str() {
                    "FEN" => {
                        current_puzzle.fen = value;
                        in_puzzle = true;
                    }
                    "Solution" | "Moves" => {
                        current_puzzle.moves = value;
                    }
                    "Rating" | "Elo" => {
                        if let Ok(rating) = value.parse::<i32>() {
                            current_puzzle.rating = rating;
                        }
                    }
                    "Popularity" => {
                        if let Ok(popularity) = value.parse::<i32>() {
                            current_puzzle.popularity = popularity;
                        }
                    }
                    "NbPlays" => {
                        if let Ok(nb_plays) = value.parse::<i32>() {
                            current_puzzle.nb_plays = nb_plays;
                        }
                    }
                    _ => {}
                }
            }
        } else if !line.starts_with('[') && in_puzzle && current_puzzle.moves.is_empty() {
            // If we have a non-header line and no moves yet, treat it as moves
            current_puzzle.moves = line.to_string();
        }
    }
    
    // Add the last puzzle if complete
    if in_puzzle && current_puzzle.is_complete() {
        puzzles.push(current_puzzle);
    }
    
    Ok(puzzles)
}

/// Parses a PGN header line and returns the key-value pair
fn parse_pgn_header(line: &str) -> Option<(String, String)> {
    if !line.starts_with('[') || !line.ends_with(']') {
        return None;
    }
    
    let content = &line[1..line.len() - 1];
    let mut parts = content.splitn(2, ' ');
    
    let key = parts.next()?.to_string();
    let value = parts.next()?;
    
    // Remove quotes if present
    let value = if value.starts_with('"') && value.ends_with('"') {
        &value[1..value.len() - 1]
    } else {
        value
    };
    
    Some((key, value.to_string()))
}

/// Represents a new puzzle to be inserted into the database
#[derive(diesel::Insertable, Default)]
#[diesel(table_name = puzzles)]
struct NewPuzzle {
    fen: String,
    moves: String,
    rating: i32,
    rating_deviation: i32,
    popularity: i32,
    nb_plays: i32,
    themes: Option<String>,
    game_url: Option<String>,
    opening_tags: Option<String>,
}

impl NewPuzzle {
    fn is_complete(&self) -> bool {
        !self.fen.is_empty() && !self.moves.is_empty()
    }
}

/// Structure for deserializing Lichess puzzle CSV rows
#[derive(Debug, Deserialize)]
struct LichessPuzzleCsv {
    #[serde(rename = "PuzzleId")]
    #[allow(dead_code)]
    puzzle_id: String,
    #[serde(rename = "FEN")]
    fen: String,
    #[serde(rename = "Moves")]
    moves: String,
    #[serde(rename = "Rating")]
    rating: Option<i32>,
    #[serde(rename = "RatingDeviation")]
    rating_deviation: Option<i32>,
    #[serde(rename = "Popularity")]
    popularity: Option<i32>,
    #[serde(rename = "NbPlays")]
    nb_plays: Option<i32>,
    #[serde(rename = "Themes")]
    themes: Option<String>,
    #[serde(rename = "GameUrl")]
    game_url: Option<String>,
    #[serde(rename = "OpeningTags")]
    opening_tags: Option<String>,
}

/// Parses puzzles from a CSV reader
#[allow(dead_code)] // May be used in the future for CSV parsing
fn parse_puzzles_from_csv<R: Read>(reader: R) -> Result<Vec<NewPuzzle>, Error> {
    let mut csv_reader = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(reader);
    
    let mut puzzles = Vec::new();
    
    for result in csv_reader.deserialize() {
        let record: LichessPuzzleCsv = result.map_err(|e| {
            Error::IoError(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("Failed to parse CSV record: {}", e),
            ))
        })?;
        
        // Skip puzzles with missing required fields
        if record.fen.is_empty() || record.moves.is_empty() {
            continue;
        }
        
        let puzzle = NewPuzzle {
            fen: record.fen,
            moves: record.moves,
            rating: record.rating.unwrap_or(1500),
            rating_deviation: record.rating_deviation.unwrap_or(350),
            popularity: record.popularity.unwrap_or(0),
            nb_plays: record.nb_plays.unwrap_or(0),
            themes: record.themes,
            game_url: record.game_url,
            opening_tags: record.opening_tags,
        };
        
        puzzles.push(puzzle);
    }
    
    Ok(puzzles)
}
