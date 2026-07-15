#!/usr/bin/env tsx
/**
 * scripts/seed-community-posts.ts
 *
 * Seed 4 example community posts on the `test-course-e2e` product so the
 * Skool-style community feed has visible content for the V1.x smoke test.
 *
 * Posts:
 *   1. Pinned "Benvenuto" note (welcome)
 *   2. Link to an external resource (e.g. blog post)
 *   3. PDF attachment (link to a public PDF)
 *   4. Video (YouTube embed)
 *
 * Idempotent — deletes the test author's existing posts for this product
 * first, then re-inserts. Safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/seed-community-posts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "test-course-e2e";

async function main() {
  console.log(`\n🌱 Seeding community posts for "${SLUG}"...\n`);

  // 1. Resolve product
  const product = await prisma.product.findUnique({
    where: { slug: SLUG },
    select: { id: true },
  });
  if (!product) {
    throw new Error(
      `Product "${SLUG}" not found. Run "npx tsx scripts/test-course-setup.ts" first.`,
    );
  }

  // 2. Find the admin/creator (same as test-course-setup.ts)
  const author =
    (await prisma.user.findFirst({
      where: { role: { in: ["admin", "creator"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true },
    })) ??
    (await prisma.user.create({
      data: {
        email: "community-seed@example.com",
        role: "admin",
        name: "Courssy Test",
      },
      select: { id: true, name: true, email: true },
    }));
  console.log(`👤 Author: ${author.name ?? author.email} (${author.id})`);

  // 3. Idempotent: delete existing posts by this author for this product
  const deleted = await prisma.communityPost.deleteMany({
    where: { productId: product.id, authorId: author.id },
  });
  if (deleted.count > 0) {
    console.log(`🗑️  Removed ${deleted.count} existing post(s)`);
  }

  // 4. Seed 4 posts
  const posts = [
    {
      type: "note" as const,
      title: "👋 Benvenuto nella Community!",
      body:
        "Questo è il feed della community — qui il creator pubblica risorse, " +
        "aggiornamenti, link utili, PDF e video. Scorri per scoprire i contenuti. " +
        "Per qualsiasi domanda personale, usa la tab Chat con il Creator.",
      url: null,
      pinned: true,
    },
    {
      type: "link" as const,
      title: "📚 Guida esterna consigliata",
      body:
        "Un articolo esterno che approfondisce i concetti del corso. " +
        "Consigliato come lettura complementare dopo la lezione 1.",
      url: "https://www.example.com/guide",
      pinned: false,
    },
    {
      type: "pdf" as const,
      title: "📄 Checklist PDF — Modulo 1",
      body:
        "La checklist stampabile del Modulo 1. Tienila sottomano mentre segui " +
        "le lezioni per verificare di aver coperto tutti i punti.",
      url: "https://www.africau.edu/images/default/sample.pdf",
      pinned: false,
    },
    {
      type: "video" as const,
      title: "🎥 Video bonus — Approfondimento",
      body:
        "Un video extra (10 min) che chiarisce un punto spesso confuso " +
        "dagli studenti. Guardalo dopo aver completato la lezione 2.",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      pinned: false,
    },
  ];

  for (const p of posts) {
    const created = await prisma.communityPost.create({
      data: {
        productId: product.id,
        authorId: author.id,
        type: p.type,
        title: p.title,
        body: p.body,
        url: p.url,
        pinned: p.pinned,
      },
    });
    console.log(
      `✅ ${p.pinned ? "📌 " : "   "}[${p.type.toUpperCase().padEnd(5)}] ${p.title} (id=${created.id.slice(0, 10)}…)`,
    );
  }

  console.log(`\n🎉 Seeded ${posts.length} community posts for "${SLUG}"!`);
  console.log(`   → Visit https://www.courssy.com/en-us/test-course-e2e/community\n`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
