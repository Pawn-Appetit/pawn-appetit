-- Database indexes for optimal game query performance
-- Creates indexes on Games table for common search patterns

-- OPTIMIZED: Added critical missing indexes for better performance

-- Single column indexes (kept from original)
CREATE INDEX IF NOT EXISTS games_date_idx ON Games(Date);
CREATE INDEX IF NOT EXISTS games_white_idx ON Games(WhiteID);
CREATE INDEX IF NOT EXISTS games_black_idx ON Games(BlackID);
CREATE INDEX IF NOT EXISTS games_result_idx ON Games(Result);
CREATE INDEX IF NOT EXISTS games_white_elo_idx ON Games(WhiteElo);
CREATE INDEX IF NOT EXISTS games_black_elo_idx ON Games(BlackElo);
CREATE INDEX IF NOT EXISTS games_plycount_idx ON Games(PlyCount);

-- NEW: Critical foreign key indexes (MAJOR PERFORMANCE BOOST)
CREATE INDEX IF NOT EXISTS games_event_idx ON Games(EventID);
CREATE INDEX IF NOT EXISTS games_site_idx ON Games(SiteID);

-- NEW: Composite indexes for common query patterns (HUGE PERFORMANCE BOOST)
-- For player searches (white OR black)
CREATE INDEX IF NOT EXISTS games_white_black_idx ON Games(WhiteID, BlackID);
CREATE INDEX IF NOT EXISTS games_black_white_idx ON Games(BlackID, WhiteID);

-- For position searches with material filtering
CREATE INDEX IF NOT EXISTS games_material_idx ON Games(WhiteMaterial, BlackMaterial);
CREATE INDEX IF NOT EXISTS games_pawn_home_idx ON Games(PawnHome);

-- For date range queries with result filtering
CREATE INDEX IF NOT EXISTS games_date_result_idx ON Games(Date, Result);

-- For ELO range searches
CREATE INDEX IF NOT EXISTS games_elo_composite_idx ON Games(WhiteElo, BlackElo);