-- Student analytics schema extension
-- Depends on 202604280001_initial_base_schema.sql

CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    participants UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES class_sessions(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL CONSTRAINT student_events_event_type_check CHECK (
        event_type IN (
            'question_asked',
            'interaction',
            'doubt_submitted',
            'experiment_entry',
            'career_query',
            'activity_logged'
        )
    ),
    event_data JSONB NOT NULL DEFAULT '{}',
    quality_score FLOAT CHECK (quality_score BETWEEN 0 AND 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_teacher ON class_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_started_at ON class_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_sessions_participants ON class_sessions USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_events_student ON student_events(student_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON student_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_session ON student_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON student_events(created_at DESC);

CREATE TABLE IF NOT EXISTS mcq_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    class_session_id UUID REFERENCES class_sessions(id) ON DELETE SET NULL,
    subject VARCHAR(100),
    topic VARCHAR(255),
    total_questions INT NOT NULL DEFAULT 20,
    max_marks INT NOT NULL DEFAULT 20,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    total_duration_ms INT,
    raw_score INT,
    irt_ability_score FLOAT,
    bloom_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcq_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mcq_session_id UUID NOT NULL REFERENCES mcq_sessions(id) ON DELETE CASCADE,
    question_id UUID,
    question_order INT,
    selected_option SMALLINT,
    correct_option SMALLINT,
    is_correct BOOLEAN,
    time_taken_ms INT,
    changed_answer BOOLEAN DEFAULT FALSE,
    change_count SMALLINT DEFAULT 0,
    difficulty FLOAT,
    discrimination FLOAT,
    bloom_level VARCHAR(20) CONSTRAINT mcq_responses_bloom_level_check CHECK (
        bloom_level IS NULL OR bloom_level IN (
            'remember',
            'understand',
            'apply',
            'analyze',
            'evaluate',
            'create'
        )
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcq_sessions_student ON mcq_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_mcq_sessions_class ON mcq_sessions(class_session_id);
CREATE INDEX IF NOT EXISTS idx_mcq_sessions_started_at ON mcq_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcq_resp_session ON mcq_responses(mcq_session_id);
CREATE INDEX IF NOT EXISTS idx_mcq_resp_question ON mcq_responses(question_id);

CREATE TABLE IF NOT EXISTS daily_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
    activity_type VARCHAR(50) CONSTRAINT daily_activities_activity_type_check CHECK (
        activity_type IS NULL OR activity_type IN (
            'sport',
            'art',
            'tech',
            'social',
            'academic',
            'civic'
        )
    ),
    activity_name VARCHAR(255),
    role VARCHAR(50) CONSTRAINT daily_activities_role_check CHECK (
        role IS NULL OR role IN (
            'leader',
            'co-leader',
            'participant',
            'organizer',
            'coach',
            'audience'
        )
    ),
    duration_minutes INT,
    description TEXT,
    mood_score FLOAT CHECK (mood_score BETWEEN 1 AND 5),
    llm_responses JSONB DEFAULT '[]',
    derived_traits JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_student ON daily_activities(student_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON daily_activities(student_id, logged_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON daily_activities(activity_type);

CREATE TABLE IF NOT EXISTS student_dimension_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    knowledge_depth FLOAT,
    engagement_index FLOAT,
    curiosity_drive FLOAT,
    test_precision FLOAT,
    leadership_signal FLOAT,
    learning_velocity FLOAT,
    retention_rate FLOAT,
    consistency_streak INT,
    mood_performance_sync FLOAT,
    peer_percentile FLOAT,
    academic_health FLOAT,
    holistic_index FLOAT,
    at_risk_score FLOAT CHECK (at_risk_score BETWEEN 0 AND 1),
    growth_7d FLOAT,
    growth_30d FLOAT,
    growth_90d FLOAT,
    archetype VARCHAR(50) CONSTRAINT student_dimension_snapshots_archetype_check CHECK (
        archetype IS NULL OR archetype IN (
            'Deep Thinker',
            'Innovator',
            'Strategist',
            'Achiever',
            'Explorer',
            'Leader',
            'Performer',
            'Emerging'
        )
    ),
    topic_mastery JSONB DEFAULT '{}',
    calculation_inputs JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_student ON student_dimension_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON student_dimension_snapshots(student_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_archetype ON student_dimension_snapshots(archetype);

CREATE OR REPLACE VIEW student_current_stats AS
SELECT DISTINCT ON (s.student_id)
    s.*,
    p.display_name,
    p.email,
    p.avatar_url
FROM student_dimension_snapshots s
JOIN profiles p ON p.id = s.student_id
ORDER BY s.student_id, s.snapshot_date DESC;

COMMENT ON TABLE class_sessions IS 'Class sessions that provide context for student event and assessment records';
COMMENT ON TABLE student_events IS 'Append-only student behavior and participation event log';
COMMENT ON TABLE mcq_sessions IS 'Per-student MCQ assessment sessions with summary scoring';
COMMENT ON TABLE mcq_responses IS 'Per-question response telemetry captured during MCQ sessions';
COMMENT ON TABLE daily_activities IS 'Student extracurricular and daily activity logs with LLM-derived traits';
COMMENT ON TABLE student_dimension_snapshots IS 'Daily computed analytics snapshot used by student cards and charts';
COMMENT ON VIEW student_current_stats IS 'Latest analytics snapshot per student for stat card and dashboard reads';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mcq_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mcq_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE daily_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_dimension_snapshots TO authenticated;
GRANT SELECT ON TABLE student_current_stats TO authenticated;

ALTER TABLE student_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_dimension_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_events_select" ON student_events;
CREATE POLICY "own_events_select"
ON student_events
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_events_insert" ON student_events;
CREATE POLICY "own_events_insert"
ON student_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_events_update" ON student_events;
CREATE POLICY "own_events_update"
ON student_events
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_events_delete" ON student_events;
CREATE POLICY "own_events_delete"
ON student_events
FOR DELETE
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_mcq_select" ON mcq_sessions;
CREATE POLICY "own_mcq_select"
ON mcq_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_mcq_insert" ON mcq_sessions;
CREATE POLICY "own_mcq_insert"
ON mcq_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_mcq_update" ON mcq_sessions;
CREATE POLICY "own_mcq_update"
ON mcq_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_mcq_delete" ON mcq_sessions;
CREATE POLICY "own_mcq_delete"
ON mcq_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_responses_select" ON mcq_responses;
CREATE POLICY "own_responses_select"
ON mcq_responses
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM mcq_sessions ms
        WHERE ms.id = mcq_session_id
          AND ms.student_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "own_responses_insert" ON mcq_responses;
CREATE POLICY "own_responses_insert"
ON mcq_responses
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM mcq_sessions ms
        WHERE ms.id = mcq_session_id
          AND ms.student_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "own_responses_update" ON mcq_responses;
CREATE POLICY "own_responses_update"
ON mcq_responses
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM mcq_sessions ms
        WHERE ms.id = mcq_session_id
          AND ms.student_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM mcq_sessions ms
        WHERE ms.id = mcq_session_id
          AND ms.student_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "own_responses_delete" ON mcq_responses;
CREATE POLICY "own_responses_delete"
ON mcq_responses
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM mcq_sessions ms
        WHERE ms.id = mcq_session_id
          AND ms.student_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "own_activities_select" ON daily_activities;
CREATE POLICY "own_activities_select"
ON daily_activities
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_activities_insert" ON daily_activities;
CREATE POLICY "own_activities_insert"
ON daily_activities
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_activities_update" ON daily_activities;
CREATE POLICY "own_activities_update"
ON daily_activities
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_activities_delete" ON daily_activities;
CREATE POLICY "own_activities_delete"
ON daily_activities
FOR DELETE
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_snapshots_select" ON student_dimension_snapshots;
CREATE POLICY "own_snapshots_select"
ON student_dimension_snapshots
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_snapshots_insert" ON student_dimension_snapshots;
CREATE POLICY "own_snapshots_insert"
ON student_dimension_snapshots
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_snapshots_update" ON student_dimension_snapshots;
CREATE POLICY "own_snapshots_update"
ON student_dimension_snapshots
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "own_snapshots_delete" ON student_dimension_snapshots;
CREATE POLICY "own_snapshots_delete"
ON student_dimension_snapshots
FOR DELETE
TO authenticated
USING (auth.uid() = student_id);
