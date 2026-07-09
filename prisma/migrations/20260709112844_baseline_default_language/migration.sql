-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "coverUrl" TEXT,
    "templateId" TEXT NOT NULL DEFAULT 'lumio',
    "stripePriceId" TEXT,
    "lemonVariantId" TEXT,
    "lemonStoreId" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pricesByCurrency" TEXT,
    "countryOverrides" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'it',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonTranslation" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoUrl" TEXT,
    "description" TEXT,

    CONSTRAINT "LessonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeSessionId" TEXT,
    "providerOrderId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "locale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastWatchedAt" TIMESTAMP(3),

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonAsset" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'it',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "productId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadata" TEXT,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "country" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseConfigCache" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseConfigCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'percent',
    "value" INTEGER NOT NULL,
    "minAmount" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "countryCode" TEXT,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fallbackLocale" TEXT,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryLocaleRule" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "preferredLocale" TEXT NOT NULL,
    "alternativeLocales" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryLocaleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouTubeChannel" (
    "id" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "countryCode" TEXT,
    "niche" TEXT,
    "defaultLandingSlug" TEXT,
    "trackingCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbandonedCheckout" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'it',
    "paymentProvider" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbandonedCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingTranslation" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroDescription" TEXT,
    "problemText" TEXT,
    "storyText" TEXT,
    "ctaText" TEXT,
    "benefits" TEXT,
    "testimonials" TEXT,
    "faq" TEXT,
    "bonusLabel" TEXT,
    "guaranteeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTranslation_productId_locale_section_key" ON "ProductTranslation"("productId", "locale", "section");

-- CreateIndex
CREATE UNIQUE INDEX "LessonTranslation_lessonId_locale_key" ON "LessonTranslation"("lessonId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentProvider_providerOrderId_key" ON "Order"("paymentProvider", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonNote_userId_lessonId_key" ON "LessonNote"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "AnalyticEvent_eventType_createdAt_idx" ON "AnalyticEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticEvent_productId_idx" ON "AnalyticEvent"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseConfigCache_slug_key" ON "CourseConfigCache"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Locale_code_key" ON "Locale"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CountryLocaleRule_countryCode_key" ON "CountryLocaleRule"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeChannel_channelUrl_key" ON "YouTubeChannel"("channelUrl");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_status_createdAt_idx" ON "AbandonedCheckout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_email_idx" ON "AbandonedCheckout"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LandingTranslation_slug_locale_key" ON "LandingTranslation"("slug", "locale");

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonTranslation" ADD CONSTRAINT "LessonTranslation_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAsset" ADD CONSTRAINT "LessonAsset_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticEvent" ADD CONSTRAINT "AnalyticEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisitorSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeChannel" ADD CONSTRAINT "YouTubeChannel_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "Locale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbandonedCheckout" ADD CONSTRAINT "AbandonedCheckout_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

