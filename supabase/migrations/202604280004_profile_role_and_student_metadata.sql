-- Extend profiles for student analytics and role-aware access.
-- Safe for existing databases.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role VARCHAR(20);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS grade VARCHAR(20);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS section VARCHAR(50);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS academic_focus VARCHAR(100);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS institution_name VARCHAR(255);

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS bio VARCHAR(255);

ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check
CHECK (
    role IS NULL OR role IN ('student', 'teacher', 'admin')
);

COMMENT ON COLUMN profiles.role IS 'Application role used for feature access control: student, teacher, or admin';
COMMENT ON COLUMN profiles.grade IS 'Student grade/class level, such as Grade 11';
COMMENT ON COLUMN profiles.section IS 'Student section or batch, such as Section B';
COMMENT ON COLUMN profiles.academic_focus IS 'Primary academic stream or major, such as Physics Major';
COMMENT ON COLUMN profiles.institution_name IS 'School or institution name';
COMMENT ON COLUMN profiles.bio IS 'Optional short profile bio for dashboards and cards';
