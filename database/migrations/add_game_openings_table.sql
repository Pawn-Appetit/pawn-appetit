-- Migration: Add game_openings table for opening-based indexing
-- This migration adds the game_openings table if it doesn't exist

CREATE TABLE IF NOT EXISTS game_openings (
    game_id INTEGER NOT NULL,
    opening_name TEXT NOT NULL,
    PRIMARY KEY (game_id, opening_name),
    FOREIGN KEY (game_id) REFERENCES Games(ID) ON DELETE CASCADE
);

-- Create indexes for game_openings table
CREATE INDEX IF NOT EXISTS game_openings_opening_idx ON game_openings(opening_name);
CREATE INDEX IF NOT EXISTS game_openings_game_idx ON game_openings(game_id);


