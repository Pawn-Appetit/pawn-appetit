-- PERFORMANCE OPTIMIZED SQLite PRAGMAs
-- These settings dramatically improve query and write performance

-- Increase cache size to 64MB (default is ~2MB)
-- More cache = fewer disk reads = faster queries
PRAGMA cache_size = -64000;

-- Store temporary tables/indexes in memory instead of disk
-- HUGE performance boost for complex queries
PRAGMA temp_store = MEMORY;

-- Disable synchronous writes for better write performance
-- Note: Only use during bulk imports or when durability isn't critical
-- For normal operations, use NORMAL (not OFF)
PRAGMA synchronous = NORMAL;

-- Use memory-mapped I/O for better read performance (256MB)
-- Allows OS to cache database pages more efficiently
PRAGMA mmap_size = 268435456;

-- Optimize page size for modern systems (4KB is optimal for most SSDs/HDDs)
-- Must be set BEFORE creating database, so this is mainly for reference
-- PRAGMA page_size = 4096;

-- Enable query optimizer for better query plans
PRAGMA optimize;








