-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_creatorId_status_idx" ON "Product"("creatorId", "status");
