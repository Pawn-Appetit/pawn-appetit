-- Per-game piece-square occupancy masks ("search booster").
--
-- Each column is the union of every square a given piece type occupied at any
-- point in the game's main line, stored as a 64-bit board mask. A game can only
-- contain a queried piece placement if (Column & Query) = Query, so this table
-- lets a position search reject the vast majority of games without decoding
-- their move blobs.
--
-- The table is derived data: it can be dropped and rebuilt from Games at any
-- time. Info.PositionIndexedUpTo records the highest Games.ID covered so far,
-- so a partial build is still usable.
CREATE TABLE IF NOT EXISTS GameIndex (
    GameID INTEGER PRIMARY KEY,
    WP INTEGER NOT NULL,
    WN INTEGER NOT NULL,
    WB INTEGER NOT NULL,
    WR INTEGER NOT NULL,
    WQ INTEGER NOT NULL,
    WK INTEGER NOT NULL,
    BP INTEGER NOT NULL,
    BN INTEGER NOT NULL,
    BB INTEGER NOT NULL,
    BR INTEGER NOT NULL,
    BQ INTEGER NOT NULL,
    BK INTEGER NOT NULL,
    FOREIGN KEY(GameID) REFERENCES Games(ID) ON DELETE CASCADE
);
