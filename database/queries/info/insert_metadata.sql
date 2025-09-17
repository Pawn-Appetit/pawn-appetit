-- Insert database version and metadata into Info table
-- {0} {1} {2} placeholders will be replaced with: DATABASE_VERSION, title, description
INSERT INTO Info (Name, Value) VALUES ("Version", "{0}");
INSERT INTO Info (Name, Value) VALUES ("Title", "{1}");
INSERT INTO Info (Name, Value) VALUES ("Description", "{2}");