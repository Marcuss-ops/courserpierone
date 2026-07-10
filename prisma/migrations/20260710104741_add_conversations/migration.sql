-- Drop old foreign keys on Message
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_receiverId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_productId_fkey";

-- Drop old indexes on Message
DROP INDEX IF EXISTS "Message_senderId_receiverId_createdAt_idx";
DROP INDEX IF EXISTS "Message_receiverId_read_createdAt_idx";
DROP INDEX IF EXISTS "Message_productId_idx";

-- Drop old columns from Message
ALTER TABLE "Message" DROP COLUMN IF EXISTS "receiverId";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "productId";

-- Create Conversation table
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userOneId" TEXT NOT NULL,
    "userTwoId" TEXT NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- Add conversationId to Message (nullable during migration)
ALTER TABLE "Message" ADD COLUMN "conversationId" TEXT;

-- Create unique index on Conversation
CREATE UNIQUE INDEX "Conversation_userOneId_userTwoId_key" ON "Conversation"("userOneId", "userTwoId");

-- Create lookup indexes on Conversation
CREATE INDEX "Conversation_userOneId_updatedAt_idx" ON "Conversation"("userOneId", "updatedAt");
CREATE INDEX "Conversation_userTwoId_updatedAt_idx" ON "Conversation"("userTwoId", "updatedAt");

-- Create new indexes on Message
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- Add foreign key from Message to Conversation
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign keys from Conversation to User
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userOneId_fkey" FOREIGN KEY ("userOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userTwoId_fkey" FOREIGN KEY ("userTwoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key from Conversation to Product
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
