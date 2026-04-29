-- Rename profiles.headline to profiles.bio while preserving existing data.
-- Safe for environments that may already have either column.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'headline'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'bio'
    ) THEN
      ALTER TABLE profiles RENAME COLUMN headline TO bio;
    ELSE
      UPDATE profiles
      SET bio = COALESCE(bio, headline)
      WHERE headline IS NOT NULL;

      ALTER TABLE profiles DROP COLUMN headline;
    END IF;
  END IF;
END $$;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS bio VARCHAR(255);

COMMENT ON COLUMN profiles.bio IS 'Optional short profile bio for dashboards and cards';
