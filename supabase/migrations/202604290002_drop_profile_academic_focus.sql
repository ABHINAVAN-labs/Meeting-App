-- Remove profiles.academic_focus as this data is no longer collected.

ALTER TABLE profiles
DROP COLUMN IF EXISTS academic_focus;
