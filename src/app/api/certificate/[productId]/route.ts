import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";

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

    // Verifica che l'utente abbia acquistato il prodotto
    const order = await prisma.order.findFirst({
      where: { userId: dbUser.id, productId, status: "completed" },
    });
    if (!order) {
      return NextResponse.json({ error: "Acquista il corso per ottenere il certificato" }, { status: 403 });
    }

    // Verifica che tutte le lezioni siano completate
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        lessons: { select: { id: true } },
        translations: {
          where: { locale: order.locale ?? "it", section: "titolo" },
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

    if (totalLessons === 0) {
      return NextResponse.json(
        { error: "Questo corso non ha lezioni — impossibile generare il certificato" },
        { status: 400 }
      );
    }
    if (completedCount < totalLessons) {
      return NextResponse.json(
        { error: `Completa tutte le ${totalLessons} lezioni per ottenere il certificato (${completedCount}/${totalLessons})` },
        { status: 400 }
      );
    }

    const courseTitle = product.translations[0]?.content || product.slug;
    const locale = order.locale ?? "it";
    const lang = locale || "en";

    // ─── Genera PDF Certificato ─────────────────────────────
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
    doc.text("COURSER", pageWidth / 2, 42, { align: "center" });

    // Titolo certificato
    doc.setFontSize(36);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const certTitle = lang === "en" ? "CERTIFICATE OF COMPLETION" : "CERTIFICATO DI COMPLETAMENTO";
    doc.text(certTitle, pageWidth / 2, 75, { align: "center" });

    // Sottotitolo
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 170);
    const thisIsTo = lang === "en" ? "This is to certify that" : "Si certifica che";
    doc.text(thisIsTo, pageWidth / 2, 95, { align: "center" });

    // Nome studente
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const studentName = dbUser.name ?? dbUser.email?.split("@")[0] ?? "Studente";
    doc.text(studentName, pageWidth / 2, 120, { align: "center" });

    // Ha completato
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 170);
    const hasCompleted = lang === "en" ? "has successfully completed the course" : "ha completato con successo il corso";
    doc.text(hasCompleted, pageWidth / 2, 138, { align: "center" });

    // Nome corso
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(77, 142, 255);
    doc.text(courseTitle, pageWidth / 2, 162, { align: "center" });

    // Dettagli
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 150);
    const completedDate = lang === "en"
      ? `Completed on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
      : `Completato il: ${new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" })}`;
    doc.text(completedDate, pageWidth / 2, 182, { align: "center" });

    const lessonText = lang === "en"
      ? `${totalLessons} lessons completed`
      : `${totalLessons} lezioni completate`;
    doc.text(lessonText, pageWidth / 2, 193, { align: "center" });

    // Linea decorativa inferiore
    doc.setDrawColor(77, 142, 255);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 40, 210, pageWidth / 2 + 40, 210);

    // Firma
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 130);
    doc.text(`© ${new Date().getFullYear()} Courser`, pageWidth / 2, 225, { align: "center" });

    // ID certificato
    const certId = `CERT-${product.slug.toUpperCase().slice(0, 8)}-${dbUser.id.slice(0, 8).toUpperCase()}-${new Date().getFullYear()}`;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 90);
    doc.text(`ID: ${certId}`, pageWidth - 25, pageHeight - 25, { align: "right" });

    // ─── Generate buffer and return ──────────────────────────
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const filename = `certificato-${product.slug}-${lang}.pdf`;

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
