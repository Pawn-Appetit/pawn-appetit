-- Set SQLite journal mode to DELETE for standard durability
-- This mode deletes the journal file when a transaction commits
PRAGMA journal_mode = DELETE;