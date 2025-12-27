CREATE TABLE IF NOT EXISTS puzzles (
    id INTEGER PRIMARY KEY,
    fen TEXT NOT NULL,
    moves TEXT NOT NULL,
    rating INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL DEFAULT 0,
    popularity INTEGER NOT NULL DEFAULT 0,
    nb_plays INTEGER NOT NULL DEFAULT 0,
    themes TEXT,
    game_url TEXT,
    opening_tags TEXT
);

-- Normalized tables for fast filtering
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
