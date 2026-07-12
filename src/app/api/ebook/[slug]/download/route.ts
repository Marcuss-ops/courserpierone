import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getCourseConfig } from "@/lib/config/white-label-data";
import { getServerUser } from "@/lib/supabase/get-user";
import fs from "fs";
import path from "path";
import { findCompletedOrder } from "@/lib/access/find-completed-order";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Check access: user must be authenticated AND have purchased this product
  const { user, dbUser } = await getServerUser();
  const url = new URL(request.url);

  let hasAccess = false;

  if (user?.email && dbUser) {
    // V2 DRY: helper consolidato (slug variant via relation filter).
    // 1 round-trip. Mantiene la shape booleana del check.
    const hasOrder = await findCompletedOrder({
      userId: dbUser.id,
      productSlug: slug,
    });
    if (hasOrder) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Unauthorized — devi aver acquistato il corso per scaricare il PDF" },
      { status: 401 }
    );
  }

  const course = await getCourseConfig(slug);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const lang = (url.searchParams.get("lang") as "it" | "en") ?? "it";
  const disposition = url.searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
  const content = course.languages[lang] || course.languages[course.defaultLanguage];
  if (!content) {
    return NextResponse.json({ error: "Language not found" }, { status: 404 });
  }

  // Check if a pre-compiled PDF exists in the course folder
  const staticPdfPath = path.join(process.cwd(), "public", "courses", slug, `${lang}.pdf`);
  if (fs.existsSync(staticPdfPath)) {
    try {
      const pdfBuffer = fs.readFileSync(staticPdfPath);
      const filename = `${slug}-${lang}-${content.ebookTitle.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().slice(0, 40)}.pdf`;
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${filename}"`,
          "Content-Length": pdfBuffer.length.toString(),
        },
      });
    } catch (error) {
      console.error(`Error reading static PDF at ${staticPdfPath}:`, error);
      // Fallback to dynamic generation if file read fails
    }
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  // ─── Helper: add text with word wrap ───────────────────────
  function addText(text: string, size: number, bold: boolean, color: number[]) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);

    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += size * 0.35 + 1;
    }
  }

  // ─── Title Page ────────────────────────────────────────────
  // Logo / brand
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(77, 142, 255);
  doc.text("COURSER", margin, y);
  y += 5;

  // Spacer
  y += 60;

  // Ebook title
  doc.setFontSize(36);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 22);
  const titleLines = doc.splitTextToSize(content.ebookTitle, maxWidth);
  for (const line of titleLines) {
    doc.text(line, margin, y);
    y += 12;
  }

  y += 15;

  // Author
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 110);
  doc.text(`by ${course.author}`, margin, y);
  y += 8;

  // Language
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 160);
  doc.text(`Language: ${lang.toUpperCase()}`, margin, y);
  y += 40;

  // Separator line
  doc.setDrawColor(77, 142, 255);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 40, y);
  y += 20;

  // Year
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 185);
  doc.text(`© ${new Date().getFullYear()} ${course.author}. All rights reserved.`, margin, y);

  // ─── Content Pages ─────────────────────────────────────────
  doc.addPage();
  y = margin;

  // Chapter title
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 22);
  const chapterTitle = lang === "it" ? "Contenuto" : "Content";
  doc.text(chapterTitle, margin, y);
  y += 10;
  doc.setDrawColor(77, 142, 255);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 30, y);
  y += 15;

  // Table of contents
  for (const ch of course.ebookChapters) {
    const chTitle = ch[lang] || ch.it;
    addText(`${chTitle}`, 12, false, [80, 80, 90]);
    y += 2;
  }

  // Main content
  doc.addPage();
  y = margin;

  const paragraphs = content.ebookContent
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    // Detect chapter headings (e.g., "Capitolo 1:" or "Chapter 1:")
    const isHeading =
      /^(capitolo|chapter|introduzione|introduction|conclusione|conclusion)/i.test(
        paragraph
      );

    if (isHeading) {
      y += 6;
      addText(paragraph, 18, true, [20, 20, 22]);
      y += 4;
    } else {
      addText(paragraph, 11, false, [60, 60, 70]);
      y += 4;
    }
  }

  // ─── Footer: page numbers ──────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 180, 185);
    doc.text(
      `${i} / ${pageCount}`,
      pageWidth - margin,
      pageHeight - 10,
      { align: "right" }
    );
    doc.text(
      content.ebookTitle,
      margin,
      pageHeight - 10
    );
  }

  // ─── Generate buffer and return ────────────────────────────
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  const filename = `${slug}-${lang}-${content.ebookTitle.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().slice(0, 40)}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
