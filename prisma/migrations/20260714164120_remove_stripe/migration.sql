/*
  Warnings:

  - You are about to drop the column `stripeSessionId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSubscriptionId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `stripePriceId` on the `Product` table. All the data in the column will be lost.
  - Made the column `conversationId` on table `Message` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Order_stripeSessionId_key";

-- AlterTable
ALTER TABLE "AnalyticEvent" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "revenueCents" INTEGER;

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "conversationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "stripeSessionId",
DROP COLUMN "stripeSubscriptionId",
ALTER COLUMN "paymentProvider" SET DEFAULT 'lemonsqueezy';

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "stripePriceId";

-- CreateIndex
CREATE INDEX "Conversation_productId_updatedAt_idx" ON "Conversation"("productId", "updatedAt");

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
