-- Backfill fixed-value constraints for databases created before
-- 202604280002_student_analytics_extension.sql included named checks.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'student_events_event_type_check'
    ) THEN
        ALTER TABLE student_events
        ADD CONSTRAINT student_events_event_type_check
        CHECK (
            event_type IN (
                'question_asked',
                'interaction',
                'doubt_submitted',
                'experiment_entry',
                'career_query',
                'activity_logged'
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'mcq_responses_bloom_level_check'
    ) THEN
        ALTER TABLE mcq_responses
        ADD CONSTRAINT mcq_responses_bloom_level_check
        CHECK (
            bloom_level IS NULL OR bloom_level IN (
                'remember',
                'understand',
                'apply',
                'analyze',
                'evaluate',
                'create'
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'daily_activities_activity_type_check'
    ) THEN
        ALTER TABLE daily_activities
        ADD CONSTRAINT daily_activities_activity_type_check
        CHECK (
            activity_type IS NULL OR activity_type IN (
                'sport',
                'art',
                'tech',
                'social',
                'academic',
                'civic'
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'daily_activities_role_check'
    ) THEN
        ALTER TABLE daily_activities
        ADD CONSTRAINT daily_activities_role_check
        CHECK (
            role IS NULL OR role IN (
                'leader',
                'co-leader',
                'participant',
                'organizer',
                'coach',
                'audience'
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'student_dimension_snapshots_archetype_check'
    ) THEN
        ALTER TABLE student_dimension_snapshots
        ADD CONSTRAINT student_dimension_snapshots_archetype_check
        CHECK (
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
        );
    END IF;
END $$;
