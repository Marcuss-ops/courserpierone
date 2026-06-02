import TemplateLumio from "./template-lumio";
import TemplateH612 from "./template-h612";
import TemplateHorizon from "./template-horizon";
import TemplateBookClaude from "./template-book-claude";

export const TEMPLATES = {
  lumio: {
    id: "lumio",
    name: "Lumio",
    description: "Minimalismo + Glassmorphism, tonalità calda ivory, gradienti sunset",
    component: TemplateLumio,
    preview: "bg-[#FAF9F5]",
    accent: "#FF416C",
  },
  h612: {
    id: "h612",
    name: "Obsidian Scholar",
    description: "Dark monochrome, tonal layering, serif + sans, liquid orbs",
    component: TemplateH612,
    preview: "bg-[#141313]",
    accent: "#4facfe",
  },
  horizon: {
    id: "horizon",
    name: "Horizon",
    description: "Airy minimalism, glassmorphism, gradienti atmosferici, cursor glow",
    component: TemplateHorizon,
    preview: "bg-[#fff9ee]",
    accent: "#FF5E3A",
  },
  "book-claude": {
    id: "book-claude",
    name: "Book Claude",
    description: "Libro/funnel editoriale con cover 3D, tabs estratti, arancione caldo",
    component: TemplateBookClaude,
    preview: "bg-white",
    accent: "#FF6B00",
  },
} as const;

export type TemplateId = keyof typeof TEMPLATES;

export { TemplateLumio, TemplateH612, TemplateHorizon, TemplateBookClaude };
