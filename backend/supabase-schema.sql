-- Supabase Database Schema for Meeting App
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (if not using Clerk's user sync)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    communication_style VARCHAR(50) DEFAULT 'collaborative',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    participants UUID[] NOT NULL,
    video_url TEXT,
    recording_url TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create insights table
CREATE TABLE IF NOT EXISTS insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    "keyPoints" JSONB DEFAULT '[]',
    "actionItems" JSONB DEFAULT '[]',
    sentiment VARCHAR(50) DEFAULT 'neutral',
    factors JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create computer vision analyses table
CREATE TABLE IF NOT EXISTS cv_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    "videoUrl" TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    results JSONB,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "completedAt" TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings("startTime");
CREATE INDEX IF NOT EXISTS idx_meetings_participants ON meetings USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_insights_user_id ON insights(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_meeting_id ON insights(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_meeting_id ON cv_analyses(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_status ON cv_analyses(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insights_updated_at BEFORE UPDATE ON insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE users IS 'User profiles and preferences';
COMMENT ON TABLE meetings IS 'Meeting records with participants and metadata';
COMMENT ON TABLE insights IS 'LLM-generated insights per user';
COMMENT ON TABLE cv_analyses IS 'Computer vision analysis jobs and results';
