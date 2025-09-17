-- Check if indexes exist on Games table
-- Returns list of all indexes defined on the Games table
SELECT name FROM pragma_index_list('Games');