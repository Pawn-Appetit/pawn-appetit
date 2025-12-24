-- Core indexes
CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(rating);
CREATE INDEX IF NOT EXISTS idx_puzzles_fen ON puzzles(fen);

-- Normalized table indexes for fast JOINs
CREATE INDEX IF NOT EXISTS idx_puzzle_themes_puzzle_id ON puzzle_themes(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_themes_theme ON puzzle_themes(theme);
CREATE INDEX IF NOT EXISTS idx_puzzle_opening_tags_puzzle_id ON puzzle_opening_tags(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_opening_tags_tag ON puzzle_opening_tags(opening_tag);

-- Composite index for common query pattern: rating + theme filtering
CREATE INDEX IF NOT EXISTS idx_puzzles_rating_id ON puzzles(rating, id);
