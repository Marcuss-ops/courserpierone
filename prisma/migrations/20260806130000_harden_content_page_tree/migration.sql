-- Harden ContentPage tree integrity and sibling position uniqueness.
-- Existing invalid edges are detached to the root rather than making the
-- migration fail; subsequent writes are rejected by the composite self-FK.

-- Repair legacy cross-product edges before adding the composite foreign key.
UPDATE "ContentPage" child
SET "parentId" = NULL
FROM "ContentPage" parent
WHERE child."parentId" = parent."id"
  AND child."productId" <> parent."productId";

-- Repair duplicate legacy positions deterministically before creating the
-- unique indexes. Existing sibling order is preserved by position then id.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "productId", "parentId"
      ORDER BY "position" ASC, id ASC
    ) AS next_position
  FROM "ContentPage"
)
UPDATE "ContentPage" page
SET "position" = ranked.next_position
FROM ranked
WHERE page.id = ranked.id
  AND page."position" <> ranked.next_position;

ALTER TABLE "ContentPage"
  DROP CONSTRAINT IF EXISTS "ContentPage_parentId_fkey";

CREATE UNIQUE INDEX "ContentPage_id_productId_key"
  ON "ContentPage" ("id", "productId");

ALTER TABLE "ContentPage"
  ADD CONSTRAINT "ContentPage_parentId_productId_fkey"
  FOREIGN KEY ("parentId", "productId")
  REFERENCES "ContentPage" ("id", "productId")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ContentPage_root_productId_position_key"
  ON "ContentPage" ("productId", "position")
  WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX "ContentPage_child_productId_parentId_position_key"
  ON "ContentPage" ("productId", "parentId", "position")
  WHERE "parentId" IS NOT NULL;
