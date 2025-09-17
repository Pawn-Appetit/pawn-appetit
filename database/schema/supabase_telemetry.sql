-- Supabase table setup for Pawn Appétit telemetry

-- Create the telemetry_events table
CREATE TABLE IF NOT EXISTS telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    app_version TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    country TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index on timestamp for efficient querying
CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp ON telemetry_events(timestamp);

-- Create an index on event_type for analytics
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events(event_type);

-- Create an index on user_id for user analytics
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user ON telemetry_events(user_id);

-- Create an index on country for geographic analytics
CREATE INDEX IF NOT EXISTS idx_telemetry_events_country ON telemetry_events(country);

-- Enable Row Level Security (RLS)
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows inserts (for telemetry data)
CREATE POLICY "Allow telemetry inserts" ON telemetry_events
    FOR INSERT WITH CHECK (true);

-- Create a policy that allows reads for authenticated users (for analytics dashboard)
CREATE POLICY "Allow authenticated reads" ON telemetry_events
    FOR SELECT USING (auth.role() = 'authenticated');

-- Grant usage on the table to anon role (for inserts)
GRANT INSERT ON telemetry_events TO anon;

-- Grant usage on the table to authenticated role (for analytics)
GRANT SELECT ON telemetry_events TO authenticated;