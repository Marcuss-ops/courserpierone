import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { getCertificateTranslations } from "@/lib/i18n/certificate-translations";
import { localeToLanguage } from "@/lib/i18n/locale-resolver";
import { getUiTranslations, interpolate } from "@/lib/i18n/ui-translations";
import { resolveProductAccess } from "@/domains/identity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;

    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive user lang for localized error messages (Accept-Language is best-
    // effort here because the order isn't loaded yet for the no-purchase path).
    const acceptLang = request.headers.get("accept-language") ?? "en";
    const errLang = localeToLanguage(acceptLang.split(",")[0]) || "en";

    // Verify the user has an active AccessGrant for this product.
    //
    // V2 cutover — AccessGrant SSOT: `resolveProductAccess` reads
    // `AccessGrant.status="active"` + non-expired, sourceType-agnostic.
    // The certificate route does NOT
    // have an inline admin bypass (mirrors the prior in-test contract)
    // — admin must hold an explicit grant to download a certificate.
    const granted = await resolveProductAccess(
      dbUser.role === "admin"
        ? { kind: "admin", adminId: dbUser.id, productId }
        : { kind: "authenticated", userId: dbUser.id, productId },
    );
    if (!granted.hasAccess) {
      // Localized "you haven't purchased yet" error. Falls back to English
      // automatically when errLang isn't a registered key.
      const t = getUiTranslations(errLang);
      return NextResponse.json(
        { error: t.dashCertNotPurchased },
        { status: 403 }
      );
    }

    // Locale source for the certificate template — switched from
    // `order.locale` (the legacy purchase-locale metadata) to
    // `dbUser.preferredLocale` (User-level preference set at signup;
    // snapshot by `processOrder` in `src/lib/commerce/orders/`).
    //
    // Why not re-fetch Order: the SSOT cutover's intent is to remove
    // the Order.status dependency from access checks. Keeping an
    // Order.locale read here would re-introduce the same coupling for
    // metadata-only purposes. `dbUser.preferredLocale` already
    // captures the user's intent and is the more semantically correct
    // source for "which language should the PDF use?".
    //
    // Defense-in-depth via `localeToLanguage`: legend reports show
    // legacy accounts whose `preferredLocale` column carries the raw
    // BCP-47 shape (`"it-it"`, `"en-US"`) — either because they were
    // created before the `processOrder` snapshot normalized it, OR
    // because they were migrated with the BCP-47 string intact.
    //
    // `localeToLanguage(...)` is idempotent: it handles both shapes
    // (BCP-47 AND language-only) and returns the canonical
    // language-only code used by `ProductTranslation.locale` rows AND
    // by `getUiTranslations(lang)`. Wrapping the read here means:
    //   - the SQL `WHERE translations.locale = ?` matches the canonical
    //     ProductTranslation row whether the legacy BCP-47 OR the new
    //     language-only shape is stored in `preferredLocale`.
    //   - The downstream `localeToLanguage(userLocale)` call is now
    //     redundant (no-op on language-only strings) — we read `lang`
    //     directly from `userLocale`.
    const userLocale = localeToLanguage(dbUser.preferredLocale ?? "it");

    // Verify all lessons are completed
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
      include: {
        lessons: { select: { id: true } },
        translations: {
          where: { locale: userLocale, section: "titolo" },
          select: { content: true },
        },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const totalLessons = product.lessons.length;
    const completedCount = await prisma.lessonProgress.count({
      where: { userId: dbUser.id, lessonId: { in: product.lessons.map(l => l.id) }, completed: true },
    });

    // `userLocale` is already a language-only code after `localeToLanguage`.
    const lang = userLocale;
    const ui = getUiTranslations(lang);

    if (totalLessons === 0) {
      // Localized "no lessons" error via ui-translations dashCertNoLessons.
      return NextResponse.json(
        { error: ui.dashCertNoLessons },
        { status: 400 }
      );
    }
    if (completedCount < totalLessons) {
      // Localized message via ui-translations dashStats*.
      const lessonsCompletedTemplate = interpolate(ui.dashStatsLessonsCompleted, { n: totalLessons });
      return NextResponse.json(
        { error: `${lessonsCompletedTemplate} (${completedCount}/${totalLessons})` },
        { status: 400 }
      );
    }

    const courseTitle = product.translations[0]?.content || product.slug;
    const cert = getCertificateTranslations(lang);

    // ─── Generate PDF Certificate ─────────────────────────────
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Sfondo scuro elegante
    doc.setFillColor(10, 10, 12);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    // Bordo decorativo
    doc.setDrawColor(77, 142, 255);
    doc.setLineWidth(1.5);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.rect(18, 18, pageWidth - 36, pageHeight - 36);

    // Linea decorativa superiore
    doc.setDrawColor(77, 142, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 40, 50, pageWidth / 2 + 40, 50);

    // Brand
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(77, 142, 255);
    doc.text(cert.brandLabel, pageWidth / 2, 42, { align: "center" });

    // Titolo certificato
    doc.setFontSize(36);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(cert.certTitle, pageWidth / 2, 75, { align: "center" });

    // Sottotitolo
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 170);
    doc.text(cert.certThisIsTo, pageWidth / 2, 95, { align: "center" });

    // Nome studente
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const studentName = dbUser.name ?? dbUser.email?.split("@")[0] ?? ui.dashWelcomeDefaultName;
    doc.text(studentName, pageWidth / 2, 120, { align: "center" });

    // Ha completato
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 170);
    doc.text(cert.certHasCompleted, pageWidth / 2, 138, { align: "center" });

    // Nome corso
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(77, 142, 255);
    doc.text(courseTitle, pageWidth / 2, 162, { align: "center" });

    // Dettagli
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 150);
    const formatterLocale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "it-IT";
    const completedDate = `${cert.certDateLabel} ${new Date().toLocaleDateString(formatterLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
    doc.text(completedDate, pageWidth / 2, 182, { align: "center" });

    doc.text(
      interpolate(cert.certLessonsCompleted, { n: totalLessons }),
      pageWidth / 2,
      193,
      { align: "center" }
    );

    // Linea decorativa inferiore
    doc.setDrawColor(77, 142, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 40, 210, pageWidth / 2 + 40, 210);

    // Firma
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 130);
    doc.text(`© ${new Date().getFullYear()} ${cert.brandLabel}`, pageWidth / 2, 225, { align: "center" });

    // ID certificato
    const certId = `CERT-${product.slug.toUpperCase().slice(0, 8)}-${dbUser.id.slice(0, 8).toUpperCase()}-${new Date().getFullYear()}`;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 90);
    doc.text(`ID: ${certId}`, pageWidth - 25, pageHeight - 25, { align: "right" });

    // ─── Generate buffer and return ──────────────────────────
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    // Localize the filename so the download is recognizable in the user's language.
    const filename = `cert-${product.slug}-${lang}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to generate certificate");
  }
}
