-- FreeDrive Database Schema
-- This file contains the SQL commands to set up the database structure for FreeDrive

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (managed by Supabase Auth, but we extend it)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Repositories table
CREATE TABLE IF NOT EXISTS repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  github_repo_id TEXT UNIQUE NOT NULL,
  size_mb DECIMAL(10,2) DEFAULT 0,
  max_size_mb DECIMAL(10,2) DEFAULT 800,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  repo_id UUID REFERENCES repos(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_mb DECIMAL(10,2) NOT NULL,
  mime_type TEXT,
  download_url TEXT NOT NULL,
  gh_release_id TEXT NOT NULL,
  gh_asset_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_repos_user_id ON repos(user_id);
CREATE INDEX IF NOT EXISTS idx_repos_active ON repos(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_repos_github_id ON repos(github_repo_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
CREATE INDEX IF NOT EXISTS idx_files_original_name ON files(original_name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repos_updated_at 
    BEFORE UPDATE ON repos 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at 
    BEFORE UPDATE ON files 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Policies for users table
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Policies for repos table
CREATE POLICY "Users can view own repositories" ON repos
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own repositories" ON repos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own repositories" ON repos
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own repositories" ON repos
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for files table
CREATE POLICY "Users can view own files" ON files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own files" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files" ON files
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own files" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- Optional: Create a view for file statistics
CREATE VIEW file_stats AS
SELECT 
    user_id,
    COUNT(*) as total_files,
    SUM(size_mb) as total_size_mb,
    AVG(size_mb) as avg_file_size_mb,
    MAX(size_mb) as largest_file_mb,
    MIN(size_mb) as smallest_file_mb,
    MAX(created_at) as last_upload
FROM files
GROUP BY user_id;

-- Optional: Create a view for repository statistics
CREATE VIEW repo_stats AS
SELECT 
    user_id,
    COUNT(*) as total_repos,
    COUNT(*) FILTER (WHERE is_active = true) as active_repos,
    SUM(size_mb) as total_used_mb,
    SUM(max_size_mb) as total_capacity_mb,
    AVG(size_mb / max_size_mb * 100) as avg_usage_percentage
FROM repos
GROUP BY user_id;

-- Function to calculate user storage statistics
CREATE OR REPLACE FUNCTION get_user_storage_stats(user_uuid UUID)
RETURNS TABLE (
    total_files BIGINT,
    total_size_mb NUMERIC,
    total_repos BIGINT,
    active_repos BIGINT,
    total_capacity_mb NUMERIC,
    usage_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(fs.total_files, 0) as total_files,
        COALESCE(fs.total_size_mb, 0) as total_size_mb,
        COALESCE(rs.total_repos, 0) as total_repos,
        COALESCE(rs.active_repos, 0) as active_repos,
        COALESCE(rs.total_capacity_mb, 0) as total_capacity_mb,
        CASE 
            WHEN rs.total_capacity_mb > 0 THEN (fs.total_size_mb / rs.total_capacity_mb * 100)
            ELSE 0
        END as usage_percentage
    FROM (SELECT user_uuid as uid) u
    LEFT JOIN file_stats fs ON fs.user_id = u.uid
    LEFT JOIN repo_stats rs ON rs.user_id = u.uid;
END;
$$ LANGUAGE plpgsql;

-- Sample data (optional, for testing)
-- Uncomment the following lines if you want to add sample data

/*
-- Insert a sample user (this would normally be handled by Supabase Auth)
INSERT INTO users (id, email) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'test@example.com')
ON CONFLICT (email) DO NOTHING;

-- Insert sample repositories
INSERT INTO repos (user_id, name, github_repo_id, size_mb, max_size_mb) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'user_test_bucket_1', 'github_repo_123', 150.5, 800),
('550e8400-e29b-41d4-a716-446655440000', 'user_test_bucket_2', 'github_repo_124', 75.2, 800)
ON CONFLICT (github_repo_id) DO NOTHING;

-- Insert sample files
INSERT INTO files (user_id, repo_id, filename, original_name, size_mb, mime_type, download_url, gh_release_id, gh_asset_id) VALUES 
(
    '550e8400-e29b-41d4-a716-446655440000',
    (SELECT id FROM repos WHERE name = 'user_test_bucket_1' LIMIT 1),
    'test_file_1234567890_abc123.jpg',
    'my_photo.jpg',
    2.5,
    'image/jpeg',
    'https://github.com/user/repo/releases/download/v1/file.jpg',
    'release_123',
    'asset_456'
),
(
    '550e8400-e29b-41d4-a716-446655440000',
    (SELECT id FROM repos WHERE name = 'user_test_bucket_1' LIMIT 1),
    'document_9876543210_def456.pdf',
    'important_document.pdf',
    5.8,
    'application/pdf',
    'https://github.com/user/repo/releases/download/v2/document.pdf',
    'release_124',
    'asset_457'
);
*/

-- Cleanup commands (use when needed)
/*
DROP VIEW IF EXISTS file_stats CASCADE;
DROP VIEW IF EXISTS repo_stats CASCADE;
DROP FUNCTION IF EXISTS get_user_storage_stats(UUID);
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS repos CASCADE;
DROP TABLE IF EXISTS users CASCADE;
*/
