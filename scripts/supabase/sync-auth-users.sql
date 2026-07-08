-- ═══════════════════════════════════════════════════════════════════
--  Trigger Supabase: sincronizza auth.users → public."User" (Prisma)
-- ═══════════════════════════════════════════════════════════════════
--  Quando un utente viene creato/aggiornato in auth.users,
--  questo trigger mantiene aggiornata la tabella Prisma User.
--  Da eseguire nel SQL Editor di Supabase.
-- ═══════════════════════════════════════════════════════════════════

-- Funzione che sincronizza un utente da auth.users a public."User"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" (id, email, name, image, role, "createdAt")
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'student'),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    image = EXCLUDED.image;
  
  RETURN NEW;
END;
$$;

-- Trigger su INSERT in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger su UPDATE in auth.users (es. cambio email)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
