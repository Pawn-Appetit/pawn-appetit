-- Delete duplicate games from the database
-- Removes games with identical EventID, SiteID, Round, WhiteID, BlackID, Moves, Date, UTCTime
-- Keeps only the first occurrence (lowest ID) of each duplicate set
DELETE FROM Games
WHERE ID IN (
    SELECT ID
    FROM (
        SELECT ID,
            ROW_NUMBER() OVER (PARTITION BY EventID, SiteID, Round, WhiteID, BlackID, Moves, Date, UTCTime ORDER BY ID) AS RowNum
        FROM Games
    ) AS Subquery
    WHERE RowNum > 1
);