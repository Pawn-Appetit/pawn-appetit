use std::{collections::VecDeque, path::PathBuf, sync::Mutex, fs::File, io::Read};

use diesel::{dsl::sql, sql_types::Bool, Connection, ExpressionMethods, QueryDsl, RunQueryDsl, insert_into, connection::SimpleConnection};
use once_cell::sync::Lazy;
use serde::Serialize;
use specta::Type;
use tauri::{path::BaseDirectory, Manager, Emitter};

use crate::{
    db::{puzzles, Puzzle},
    error::Error,
};

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

    random: bool,
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
    ///
    /// # Returns
    /// * `Ok(())` if puzzles were loaded successfully
    /// * `Err(Error)` if there was a problem loading puzzles
    fn get_puzzles(&mut self, file: &str, min_rating: u16, max_rating: u16, random: bool) -> Result<(), Error> {
        if self.cache.is_empty()
            || self.min_rating != min_rating
            || self.max_rating != max_rating
            || self.random != random
            || self.counter >= self.cache_size
        {
            self.cache.clear();
            self.counter = 0;

            let mut db = diesel::SqliteConnection::establish(file)?;
            let new_puzzles = if random {
                puzzles::table
                    .filter(puzzles::rating.le(max_rating as i32))
                    .filter(puzzles::rating.ge(min_rating as i32))
                    .order(sql::<Bool>("RANDOM()"))
                    .limit(self.cache_size as i64)
                    .load::<Puzzle>(&mut db)?
            } else {
                puzzles::table
                    .filter(puzzles::rating.le(max_rating as i32))
                    .filter(puzzles::rating.ge(min_rating as i32))
                    .order(puzzles::id.asc())
                    .order(puzzles::rating.asc())
                    .limit(self.cache_size as i64)
                    .load::<Puzzle>(&mut db)?
            };

            self.cache = new_puzzles.into_iter().collect();
            self.min_rating = min_rating;
            self.max_rating = max_rating;
            self.random = random
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
///
/// # Returns
/// * `Ok(Puzzle)` if a puzzle was found
/// * `Err(Error::NoPuzzles)` if no puzzles match the criteria
/// * Other errors if there was a problem accessing the database
#[tauri::command]
#[specta::specta]
pub fn get_puzzle(file: String, min_rating: u16, max_rating: u16, random: bool) -> Result<Puzzle, Error> {
    static PUZZLE_CACHE: Lazy<Mutex<PuzzleCache>> = Lazy::new(|| Mutex::new(PuzzleCache::new()));

    let mut cache = PUZZLE_CACHE
        .lock()
        .map_err(|e| Error::MutexLockFailed(format!("Failed to lock puzzle cache: {}", e)))?;
    cache.get_puzzles(&file, min_rating, max_rating, random)?;
    // Get a reference to the next puzzle and clone it only if found
    match cache.get_next_puzzle() {
        Some(puzzle) => Ok(puzzle.clone()),
        None => Err(Error::NoPuzzles),
    }
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
    storage_size: i32,
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

    let storage_size = file_path.metadata()?.len() as i32;
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

    let extension = source_file.extension().and_then(|ext| ext.to_str());
    
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
            // Handle compressed files
            import_puzzles_from_compressed(&source_file, &db_path, &title, &description, &app).await
        }
        _ => Err(Error::UnsupportedFileFormat(format!(
            "Unsupported file format: {:?}",
            extension
        ))),
    }
}

/// Copies an existing puzzle database to a new location
async fn copy_puzzle_database(
    source_file: &PathBuf,
    db_path: &PathBuf,
    _title: &str,
    _description: &str,
) -> Result<(), Error> {
    // Copy the source database file to the destination path
    std::fs::copy(source_file, db_path)
        .map_err(|e| Error::IoError(std::io::Error::new(e.kind(), format!("Failed to copy database: {}", e))))?;
    Ok(())
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

/// Imports puzzles from a compressed file
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

/// Creates a new puzzle database with the proper schema
fn create_puzzle_database(db_path: &PathBuf, _title: &str, _description: &str) -> Result<(), Error> {
    let mut db = diesel::SqliteConnection::establish(&db_path.to_string_lossy())?;
    
    // Load the schema from external SQL files
    const PUZZLES_TABLES: &str = include_str!("../../database/schema/puzzles_tables.sql");
    const PUZZLES_INDEXES: &str = include_str!("../../database/indexes/puzzles_indexes.sql");
    
    // Create the puzzles table using the external schema
    db.batch_execute(PUZZLES_TABLES)?;
    
    // Create the indexes
    db.batch_execute(PUZZLES_INDEXES)?;
    
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
}

impl NewPuzzle {
    fn is_complete(&self) -> bool {
        !self.fen.is_empty() && !self.moves.is_empty()
    }
}
