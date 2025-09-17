-- Initial seed data for core database tables
-- Contains default records for unknown entities

INSERT INTO Players (ID, Name, Elo) VALUES (0, 'Unknown', NULL);
INSERT INTO Events (ID, Name) VALUES (0, 'Unknown');
INSERT INTO Sites (ID, Name) VALUES (0, 'Unknown');