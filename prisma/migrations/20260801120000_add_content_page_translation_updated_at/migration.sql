-- Keep ContentPageTranslation mutation timestamps aligned with the
-- application contract used by save/rename operations.
ALTER TABLE "ContentPageTranslation"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
