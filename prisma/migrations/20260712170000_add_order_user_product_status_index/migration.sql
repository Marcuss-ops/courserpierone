-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_userId_productId_status_idx" ON "Order"("userId", "productId", "status");
