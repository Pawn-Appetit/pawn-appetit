-- Delete duplicate games from the database
-- A game can be stored more than once: byte-identical re-imports, and the same
-- game re-imported with a richer move encoding (comments and clocks) than an
-- earlier bare one. Rows sharing date, time, players, result and ply count are
-- the same game; keep the most detailed record, then the oldest row.
DELETE FROM Games
WHERE ID NOT IN (
    SELECT keep_id
    FROM (
        SELECT ID AS keep_id,
            ROW_NUMBER() OVER (
                PARTITION BY Date, UTCTime, WhiteID, BlackID, Result, PlyCount
                ORDER BY length(Moves) DESC, ID
            ) AS row_num
        FROM Games
    ) AS ranked
    WHERE row_num = 1
);
