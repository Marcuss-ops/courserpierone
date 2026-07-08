-- ════════════════════════════════════════════════════════════
-- Supabase Storage + Profiles Setup
-- ════════════════════════════════════════════════════════════
--
-- Questo script configura:
-- 1. Storage bucket per upload utenti (avatars, documenti)
-- 2. RLS policies per accesso per-utente (auth.uid())
-- 3. Tabella profiles con RLS (per direct Supabase client access)
--
-- Eseguire nel SQL Editor di Supabase.
-- ════════════════════════════════════════════════════════════

-- ─── 1. Storage Bucket ───────────────────────────────────
-- Crea un bucket privato per gli upload degli utenti
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user_uploads',
  'user_uploads',
  false, -- privato: solo utenti autenticati possono accedere
  52428800, -- 50 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Storage RLS Policies ─────────────────────────────
-- Gli utenti possono:
-- - Uploadare solo nella propria cartella (auth.uid() = folder)
-- - Leggere solo i propri file
-- - Aggiornare/eliminare solo i propri file

-- Policy: SELECT (lettura dei propri file)
DROP POLICY IF EXISTS "Users can read their own uploads" ON storage.objects;
CREATE POLICY "Users can read their own uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user_uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: INSERT (upload nella propria cartella)
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
CREATE POLICY "Users can upload to their own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user_uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: UPDATE (aggiornare i propri file)
DROP POLICY IF EXISTS "Users can update their own uploads" ON storage.objects;
CREATE POLICY "Users can update their own uploads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user_uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user_uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: DELETE (eliminare i propri file)
DROP POLICY IF EXISTS "Users can delete their own uploads" ON storage.objects;
CREATE POLICY "Users can delete their own uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user_uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════
-- ─── 3. Profiles Table (opzionale, per direct Supabase access) ─
-- ════════════════════════════════════════════════════════════
--
-- Questa tabella è un mirror della tabella Prisma User, esposta
-- anche via Supabase client per direct queries dal browser.
-- Il trigger qui sotto popola profiles quando un nuovo utente fa signup.
--
-- Per ora creiamo solo la struttura + RLS.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- RLS su profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT (solo utenti autenticati — no PII leak a scrapers anonimi)
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Policy: UPDATE (solo il proprietario può aggiornare il proprio profilo)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy: INSERT (solo l'utente stesso può creare il proprio profilo)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ─── 4. Trigger: auto-create profile on signup ─────────────
-- Quando un nuovo utente viene creato in auth.users, crea automaticamente
-- un record in profiles. Si attiva SOLO su INSERT (non su UPDATE) per
-- evitare upsert inutili ad ogni cambio di metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

-- Create trigger (solo su INSERT, non su UPDATE)
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════
-- Verifica setup
-- ════════════════════════════════════════════════════════════
-- Eseguire queste query per verificare che tutto sia ok:
--
-- SELECT * FROM storage.buckets WHERE id = 'user_uploads';
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
-- SELECT * FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public';
