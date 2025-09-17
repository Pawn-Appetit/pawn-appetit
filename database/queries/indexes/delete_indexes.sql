-- Drop database indexes and vacuum for database cleanup
-- Removes performance indexes and reclaims storage space

DROP INDEX IF EXISTS games_date_idx;
DROP INDEX IF EXISTS games_white_idx;
DROP INDEX IF EXISTS games_black_idx;
DROP INDEX IF EXISTS games_result_idx;
DROP INDEX IF EXISTS games_white_elo_idx;
DROP INDEX IF EXISTS games_black_elo_idx;
DROP INDEX IF EXISTS games_plycount_idx;

VACUUM;