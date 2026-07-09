-- CreateIndex
CREATE INDEX "AnalyticEvent_sessionId_idx" ON "AnalyticEvent"("sessionId");

-- CreateIndex
CREATE INDEX "Lesson_productId_idx" ON "Lesson"("productId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_completed_idx" ON "LessonProgress"("userId", "completed");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");
