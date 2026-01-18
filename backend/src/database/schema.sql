-- Database Schema Initialization Script
-- For Transvortex Facebook Pages Manager
-- 
-- Instructions:
-- 1. Connect to your PostgreSQL database:
--    psql postgresql://user:password@host:5432/database_name
-- 2. Copy and paste the SQL below
-- 3. Verify tables created: \dt
-- 4. Verify indexes: \di

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Application users with authentication credentials';
COMMENT ON COLUMN users.email IS 'Unique email address for login';
COMMENT ON COLUMN users.password_hash IS 'Hashed password (bcryptjs)';
COMMENT ON COLUMN users.role IS 'User role for authorization (user/admin/moderator)';
COMMENT ON COLUMN users.is_active IS 'Account active status (soft delete)';

-- =============================================
-- FACEBOOK PAGES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS facebook_pages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facebook_page_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    avatar_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    posted_today BOOLEAN DEFAULT false,
    last_posted TIMESTAMP,
    next_scheduled_post TIMESTAMP,
    total_posts_count INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE facebook_pages IS 'User''s Facebook pages being managed';
COMMENT ON COLUMN facebook_pages.facebook_page_id IS 'Facebook Graph API page ID';
COMMENT ON COLUMN facebook_pages.posted_today IS 'Flag if already posted today';
COMMENT ON COLUMN facebook_pages.status IS 'Page management status';

-- =============================================
-- POSTS TABLE (For future scheduling)
-- =============================================
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    scheduled_for TIMESTAMP,
    published_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
    facebook_post_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE posts IS 'Scheduled or posted content for Facebook pages';
COMMENT ON COLUMN posts.status IS 'Post lifecycle status';

-- =============================================
-- REFRESH TOKENS TABLE (For session invalidation)
-- =============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    is_revoked BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for session management and logout';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of actual token (never store plaintext)';
COMMENT ON COLUMN refresh_tokens.is_revoked IS 'Token revocation flag for logout';

-- =============================================
-- ACTIVITY LOGS TABLE (For audit trail)
-- =============================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    changes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE activity_logs IS 'Audit trail for user actions and security monitoring';
COMMENT ON COLUMN activity_logs.changes IS 'JSON object with before/after values';

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Facebook pages indexes
CREATE INDEX idx_pages_user_id ON facebook_pages(user_id);
CREATE INDEX idx_pages_facebook_id ON facebook_pages(facebook_page_id);
CREATE INDEX idx_pages_status ON facebook_pages(status);
CREATE INDEX idx_pages_posted_today ON facebook_pages(posted_today);
CREATE INDEX idx_pages_created_at ON facebook_pages(created_at DESC);

-- Posts indexes
CREATE INDEX idx_posts_page_id ON posts(page_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_scheduled_for ON posts(scheduled_for);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Refresh tokens indexes
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Activity logs indexes
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- =============================================
-- VIEWS (Optional - for common queries)
-- =============================================

-- View for user activity summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT 
    u.id,
    u.email,
    u.name,
    COUNT(DISTINCT fp.id) as managed_pages,
    COUNT(DISTINCT p.id) as total_posts,
    COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) as published_posts,
    u.last_login,
    u.created_at
FROM users u
LEFT JOIN facebook_pages fp ON u.id = fp.user_id
LEFT JOIN posts p ON u.id = p.user_id
WHERE u.is_active = true
GROUP BY u.id, u.email, u.name, u.last_login, u.created_at;

-- =============================================
-- FUNCTIONS (For automation)
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON facebook_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at BEFORE UPDATE ON refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Run these to verify setup:
-- SELECT * FROM information_schema.tables WHERE table_schema = 'public';
-- \dt                                    -- List all tables
-- \di                                    -- List all indexes
-- \dv                                    -- List all views

-- =============================================
-- SAMPLE DATA (Optional - for development)
-- =============================================

-- DO NOT run in production! Only for local development.
-- Uncomment if needed:

/*
-- Create test user (password: TestPass123!)
INSERT INTO users (email, password_hash, name, role, email_verified, email_verified_at)
VALUES (
    'test@example.com',
    '$2a$12$V/fVKaMzWAhVj9W8hNzLRuaVJ7eJJL.pwtvKSYlR8Oj8hBePJ1MuS',
    'Test User',
    'user',
    true,
    CURRENT_TIMESTAMP
) ON CONFLICT (email) DO NOTHING;

-- Add sample Facebook page
INSERT INTO facebook_pages (user_id, facebook_page_id, name, url, status, posted_today)
SELECT id, '123456789', 'Sample Page', 'https://facebook.com/samplepage', 'active', false
FROM users WHERE email = 'test@example.com'
ON CONFLICT (facebook_page_id) DO NOTHING;
*/

-- =============================================
-- CLEANUP (If you need to start over)
-- =============================================

-- WARNING: This deletes all data!
-- DROP TABLE IF EXISTS activity_logs CASCADE;
-- DROP TABLE IF EXISTS refresh_tokens CASCADE;
-- DROP TABLE IF EXISTS posts CASCADE;
-- DROP TABLE IF EXISTS facebook_pages CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- =============================================
-- Script completed successfully!
-- =============================================
-- 
-- Next steps:
-- 1. Verify tables created: SELECT * FROM information_schema.tables WHERE table_schema = 'public';
-- 2. Verify users table has email unique constraint
-- 3. Run application migrations (if any)
-- 4. Seed sample data (if needed)
-- 5. Test API endpoints
