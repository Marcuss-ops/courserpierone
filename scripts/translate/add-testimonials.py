import os
import json
import re

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "amish-secrets"))

NEW_TESTIMONIALS = {
  "en": [
    {
      "text": "The infinite pantry changed my life. I haven't thrown away food in 3 months and save about $120/month. Highly recommended!",
      "name": "Lucia G.",
      "role": "Milan — early reader"
    },
    {
      "text": "I was skeptical at first, but the budget method is clear and practical. I've already reduced my utility bills by 25%.",
      "name": "Giovanni P.",
      "role": "Turin — early reader"
    }
  ],
  "it": [
    {
      "text": "La dispensa infinita mi ha cambiato la vita. Da 3 mesi non butto cibo e risparmio circa 120€ al mese. Super consigliato!",
      "name": "Lucia G.",
      "role": "Milano — lettrice"
    },
    {
      "text": "All'inizio ero scettico, ma il metodo del budget è chiarissimo e pratico. Ho già ridotto le bollette del 25%.",
      "name": "Giovanni P.",
      "role": "Torino — studente"
    }
  ],
  "da": [
    {
      "text": "Det uendelige spisekammer har ændret mit liv. Jeg har ikke smidt mad ud i 3 måneder og sparer omkring 120 € om måneden. Kan varmt anbefales!",
      "name": "Lucia G.",
      "role": "Milano - tidlige læsere"
    },
    {
      "text": "Jeg var skeptisk i starten, men budgetmetoden er klar og praktisk. Jeg har allerede reduceret mine elregninger med 25%.",
      "name": "Giovanni P.",
      "role": "Torino - tidlige læsere"
    }
  ]
}

# Try importing argostranslate for translation of other languages
argos_available = False
try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
    argos_available = True
except ImportError:
    print("Argos Translate not installed, will fallback to English translations for other languages.")

def get_translator(source: str, target: str):
    if not argos_available:
        return None
    try:
        a_pkg.update_package_index()
        avail = a_pkg.get_available_packages()
        pkg = next((p for p in avail if p.from_code == source and p.to_code == target), None)
        if not pkg:
            return None

        installed = a_tr.get_installed_languages()
        fl = next((l for l in installed if l.code == source), None)
        tl = next((l for l in installed if l.code == target), None)

        if not fl or not tl:
            pkg.install()
            installed = a_tr.get_installed_languages()
            fl = next(l for l in installed if l.code == source)
            tl = next(l for l in installed if l.code == target)

        return fl.get_translation(tl)
    except Exception as e:
        print(f"Failed to load translator {source}->{target}: {e}")
        return None

def main():
    if not os.path.exists(DATA_DIR):
        print(f"Directory {DATA_DIR} not found.")
        return

    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json")]
    print(f"Found {len(files)} JSON translation files.")

    for fname in sorted(files):
        lang = fname.split(".")[0].lower()
        filepath = os.path.join(DATA_DIR, fname)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        if "testimonials" not in data:
            data["testimonials"] = {"badge": "", "title": "", "items": []}
        
        # Reset items to only have the first one if we need to reconstruct or re-run
        first_item = data["testimonials"]["items"][0] if data["testimonials"]["items"] else None
        
        if first_item:
            data["testimonials"]["items"] = [first_item]
        else:
            continue

        # Add 2 new testimonials
        if lang in NEW_TESTIMONIALS:
            data["testimonials"]["items"].extend(NEW_TESTIMONIALS[lang])
            print(f"Added pre-translated testimonials to {fname}")
        else:
            # Try translating from English
            translator = get_translator("en", lang)
            for t_item in NEW_TESTIMONIALS["en"]:
                if translator:
                    try:
                        translated_text = translator.translate(t_item["text"])
                        translated_role = translator.translate(t_item["role"])
                        data["testimonials"]["items"].append({
                            "text": translated_text,
                            "name": t_item["name"],
                            "role": translated_role
                        })
                    except Exception as e:
                        print(f"Error translating testimonial to {lang}: {e}")
                        # Fallback to English
                        data["testimonials"]["items"].append(t_item)
                else:
                    data["testimonials"]["items"].append(t_item)
            print(f"Added translated/fallback testimonials to {fname}")

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("Finished adding testimonials to all files.")

if __name__ == "__main__":
    main()
