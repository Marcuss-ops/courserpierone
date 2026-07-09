-- ═══════════════════════════════════════════════════════════════════
--  Supabase RLS — Blocca accesso pubblico a TUTTE le tabelle
-- ═══════════════════════════════════════════════════════════════════
--  Versione semplificata — una query per tabella, niente dynamic SQL
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Product" ON "Product" FOR ALL USING (false);

ALTER TABLE "ProductTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_ProductTranslation" ON "ProductTranslation" FOR ALL USING (false);

ALTER TABLE "Lesson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Lesson" ON "Lesson" FOR ALL USING (false);

ALTER TABLE "LessonTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_LessonTranslation" ON "LessonTranslation" FOR ALL USING (false);

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Order" ON "Order" FOR ALL USING (false);

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_User" ON "User" FOR ALL USING (false);

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Account" ON "Account" FOR ALL USING (false);

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Session" ON "Session" FOR ALL USING (false);

ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_VerificationToken" ON "VerificationToken" FOR ALL USING (false);

ALTER TABLE "LessonProgress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_LessonProgress" ON "LessonProgress" FOR ALL USING (false);

ALTER TABLE "LessonNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_LessonNote" ON "LessonNote" FOR ALL USING (false);

ALTER TABLE "LessonAsset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_LessonAsset" ON "LessonAsset" FOR ALL USING (false);

ALTER TABLE "AnalyticEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_AnalyticEvent" ON "AnalyticEvent" FOR ALL USING (false);

ALTER TABLE "VisitorSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_VisitorSession" ON "VisitorSession" FOR ALL USING (false);

ALTER TABLE "CourseConfigCache" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_CourseConfigCache" ON "CourseConfigCache" FOR ALL USING (false);

ALTER TABLE "Locale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_Locale" ON "Locale" FOR ALL USING (false);

ALTER TABLE "CountryLocaleRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_CountryLocaleRule" ON "CountryLocaleRule" FOR ALL USING (false);

ALTER TABLE "YouTubeChannel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_YouTubeChannel" ON "YouTubeChannel" FOR ALL USING (false);

ALTER TABLE "AbandonedCheckout" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_AbandonedCheckout" ON "AbandonedCheckout" FOR ALL USING (false);

ALTER TABLE "LandingTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_LandingTranslation" ON "LandingTranslation" FOR ALL USING (false);

-- ═══════════════════════════════════════════════════════════════════
--  Verifica finale
-- ═══════════════════════════════════════════════════════════════════
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
