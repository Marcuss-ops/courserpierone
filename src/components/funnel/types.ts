/**
 * src/components/funnel/types.ts
 *
 * Shared TypeScript types + data constants for the funnel template package.
 *
 * Originally exported from `@/components/funnel` (the deleted barrel
 * `src/components/funnel/index.ts`, removed in commit post-Fase 7.2
 * knip cleanup). The 5-value union matches the original
 * `keyof typeof TEMPLATES` from the deleted barrel exactly.
 *
 * `TEMPLATES` qui contiene SOLO i campi data-only (id, name, description,
 * preview, accent). Il campo `component` è stato rimosso: le pagine
 * pubbliche importano i template via `next/dynamic` direttamente da
 * `template-{name}.tsx` (vedi `src/app/(locale)/[locale]/[domain]/page.tsx`).
 * L'admin `TemplateSelector` consuma solo name + description.
 */

export type TemplateId = "lumio" | "h612" | "horizon" | "book-claude" | "amish";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  /** Tailwind background class per l'anteprima nella TemplateSelector. */
  preview: string;
  /** Accent color hex per l'icona. */
  accent: string;
}

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
  lumio: {
    id: "lumio",
    name: "Lumio",
    description: "Minimalismo + Glassmorphism, tonalità calda ivory, gradienti sunset",
    preview: "bg-[#FAF9F5]",
    accent: "#FF416C",
  },
  h612: {
    id: "h612",
    name: "Obsidian Scholar",
    description: "Dark monochrome, tonal layering, serif + sans, liquid orbs",
    preview: "bg-[#141313]",
    accent: "#4facfe",
  },
  horizon: {
    id: "horizon",
    name: "Horizon",
    description: "Airy minimalism, glassmorphism, gradienti atmosferici, cursor glow",
    preview: "bg-[#fff9ee]",
    accent: "#FF5E3A",
  },
  "book-claude": {
    id: "book-claude",
    name: "Book Claude",
    description: "Libro/funnel editoriale con cover 3D, tabs estratti, arancione caldo",
    preview: "bg-white",
    accent: "#FF6B00",
  },
  amish: {
    id: "amish",
    name: "Amish Editorial",
    description: "Design editoriale caldo, tonalità avorio/salvia/marrone, serif Playfair Display",
    preview: "bg-[#FFFBF5]",
    accent: "#C9840D",
  },
};
