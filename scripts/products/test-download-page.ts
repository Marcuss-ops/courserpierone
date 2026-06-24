import { getCourseConfig } from "../../src/lib/config/white-label-data";
import { getAvailableEbookBooks } from "../../src/lib/books/ebook-catalog";
import { loadLocaleContentSafe } from "../../src/lib/i18n/load-locale-content";

async function test() {
  try {
    const domain = "amish-secrets";
    const locale = "en-us";
    const lang = undefined; // simulate middleware deleting the lang query param
    const token = undefined;

    console.log("1. Fetching course config...");
    const course = await getCourseConfig(domain);
    if (!course) {
      console.log("Course not found!");
      return;
    }
    console.log("Course config found:", course.slug);

    console.log("2. Fetching available books...");
    const availableBooks = getAvailableEbookBooks(domain);
    console.log("Available books count:", availableBooks.length);

    console.log("3. Resolving currentLang...");
    const currentLang = lang || availableBooks[0]?.code || locale.split("-")[0] || course.defaultLanguage || "en";
    console.log("Resolved currentLang:", currentLang);

    console.log("4. Fetching content...");
    const content = course.languages[currentLang] || course.languages[course.defaultLanguage];
    if (!content) {
      console.log("Content not found for language:", currentLang, "or default:", course.defaultLanguage);
    } else {
      console.log("Content resolved:", content.title);
    }

    console.log("5. Loading locale content safe...");
    const localeContent = loadLocaleContentSafe(domain, currentLang);
    console.log("Locale content loaded:", !!localeContent);

    console.log("6. Resolving lc...");
    const defaultDownloadTranslations: Record<string, any> = {
      it: {
        title: "Scarica il tuo libro",
        subtitle: "Il tuo eBook è pronto. Scaricalo in PDF o leggilo direttamente online.",
        download_button: "Scarica PDF",
        view_online: "Leggi Online",
        language_label: "Lingua",
        your_language: "La tua lingua",
        other_languages: "Altre versioni disponibili",
        success_message: "Acquisto completato! Il libro è tuo.",
        back_to_portal: "Torna al Portal"
      },
      en: {
        title: "Download your book",
        subtitle: "Your eBook is ready. Download it in PDF or read it online.",
        download_button: "Download PDF",
        view_online: "Read Online",
        language_label: "Language",
        your_language: "Your language",
        other_languages: "Other versions available",
        success_message: "Purchase complete! The book is yours.",
        back_to_portal: "Back to Portal"
      }
    };
    const langCode = currentLang.split("-")[0];
    const lc = localeContent.download || defaultDownloadTranslations[langCode] || defaultDownloadTranslations.en;
    console.log("lc resolved:", !!lc, lc.title);

    console.log("7. Calculating URLs...");
    const accent = course.accentColor ?? "#C9840D";
    const ebookTitle = content.ebookTitle || content.title;
    const availableLanguages = availableBooks;
    const activeBook = availableBooks.find((book) => book.code === currentLang) || availableBooks[0];
    const staticBookUrl = activeBook ? `/courses/${domain}/${encodeURIComponent(activeBook.fileName)}` : null;

    const downloadUrl = staticBookUrl || `/api/ebook/${domain}/download?lang=${currentLang}&disposition=attachment${token ? `&token=${token}` : ""}`;
    const viewerUrl = staticBookUrl || `/api/ebook/${domain}/download?lang=${currentLang}&disposition=inline${token ? `&token=${token}` : ""}`;
    
    console.log("accent:", accent);
    console.log("ebookTitle:", ebookTitle);
    console.log("staticBookUrl:", staticBookUrl);
    console.log("downloadUrl:", downloadUrl);
    console.log("viewerUrl:", viewerUrl);

    console.log("SUCCESS! No exception thrown.");
  } catch (err) {
    console.error("FAILED with error:", err);
  }
}

test();
