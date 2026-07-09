/*
  Warnings:

  - You are about to drop the `DiscussionComment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscussionLike` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiscussionPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DiscussionComment" DROP CONSTRAINT "DiscussionComment_postId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionComment" DROP CONSTRAINT "DiscussionComment_userId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionLike" DROP CONSTRAINT "DiscussionLike_commentId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionLike" DROP CONSTRAINT "DiscussionLike_postId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionLike" DROP CONSTRAINT "DiscussionLike_userId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPost" DROP CONSTRAINT "DiscussionPost_productId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPost" DROP CONSTRAINT "DiscussionPost_userId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropTable
DROP TABLE "DiscussionComment";

-- DropTable
DROP TABLE "DiscussionLike";

-- DropTable
DROP TABLE "DiscussionPost";

-- DropTable
DROP TABLE "Notification";
