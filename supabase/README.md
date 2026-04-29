# Supabase migrations

This folder is the source of truth for database evolution going forward.

## Current migrations

1. `migrations/202604280001_initial_base_schema.sql`
2. `migrations/202604280002_student_analytics_extension.sql`
3. `migrations/202604280003_student_analytics_value_constraints.sql`
4. `migrations/202604280004_profile_role_and_student_metadata.sql`

## How to apply today

If you are using the Supabase SQL Editor manually:

1. Run `202604280001_initial_base_schema.sql` on a fresh project.
2. Run `202604280002_student_analytics_extension.sql` after it.

If your current project already has the base tables (`profiles`, `meetings`, `insights`, `cv_analyses`):

1. Do not re-bootstrap from scratch.
2. Run `202604280002_student_analytics_extension.sql`.
3. Then run `202604280003_student_analytics_value_constraints.sql`.

## Team workflow going forward

1. Never edit old migration files after they have been applied to shared environments.
2. For every schema change, add a new timestamped file in `supabase/migrations/`.
3. Keep changes additive when possible.
4. Use `ALTER TABLE`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS`, and `CREATE OR REPLACE VIEW/FUNCTION` for safe evolution.

## About `backend/supabase-schema.sql`

That file remains as a consolidated reference for now, but new production-style schema changes should be added as new migration files under `supabase/migrations/`.
