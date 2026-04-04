-- Migration: Create operator_profiles for push notification tokens
-- Run via Supabase Dashboard SQL Editor or: supabase db push

CREATE TABLE IF NOT EXISTS intel.operator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text,
  preferences jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: operators can read/write their own profile
ALTER TABLE intel.operator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can read own profile"
  ON intel.operator_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Operators can upsert own profile"
  ON intel.operator_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Operators can update own profile"
  ON intel.operator_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role needs full access for the Edge Function to read tokens
CREATE POLICY "Service role full access"
  ON intel.operator_profiles FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'operator' OR current_setting('role') = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION intel.update_operator_profiles_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_operator_profiles_timestamp
  BEFORE UPDATE ON intel.operator_profiles
  FOR EACH ROW
  EXECUTE FUNCTION intel.update_operator_profiles_updated_at();

COMMENT ON TABLE intel.operator_profiles IS 'Operator device tokens and preferences for the Command Center app';
