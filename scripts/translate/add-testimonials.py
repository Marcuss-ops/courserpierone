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
    },
    {
      "text": "As a Dane, I love efficiency. This course shows exactly how the Amish eliminate financial waste.",
      "name": "Anders S.",
      "role": "Copenhagen — engineer"
    },
    {
      "text": "Managing a family of 4 in an expensive city is hard. Thanks to Amish planning techniques, I save over 30%.",
      "name": "Sarah M.",
      "role": "Boston — mother"
    },
    {
      "text": "Fluctuating income gave me anxiety. The Amish budget taught me how to build stability and never carry debt.",
      "name": "Mateo L.",
      "role": "Madrid — freelancer"
    },
    {
      "text": "Amish minimalism applied to household finance is brilliant. Great material, both theoretical and practical.",
      "name": "Yuki T.",
      "role": "Tokyo — analyst"
    },
    {
      "text": "Very practical method. I eliminated all unnecessary installment payments and now manage monthly cash flow stress-free.",
      "name": "Dmitry K.",
      "role": "Moscow — marketer"
    },
    {
      "text": "The guide to self-production and DIY repairs alone is worth the entire price. Finally in control of my bank account.",
      "name": "Claire B.",
      "role": "Paris — teacher"
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
    },
    {
      "text": "Essendo danese adoro l'efficienza. Questo corso mostra esattamente come gli Amish eliminano gli sprechi finanziari.",
      "name": "Anders S.",
      "role": "Copenaghen — ingegnere"
    },
    {
      "text": "Gestire una famiglia di 4 persone in una città costosa è difficile. Grazie alle tecniche di pianificazione Amish risparmio oltre il 30%.",
      "name": "Sarah M.",
      "role": "Boston — mamma"
    },
    {
      "text": "Le entrate fluttuanti mi davano ansia. Il budget Amish mi ha insegnato come creare stabilità e non avere mai debiti.",
      "name": "Mateo L.",
      "role": "Madrid — freelance"
    },
    {
      "text": "Il minimalismo Amish applicato alla finanza domestica è geniale. Ottimo materiale sia teorico che pratico.",
      "name": "Yuki T.",
      "role": "Tokyo — analista"
    },
    {
      "text": "Metodo molto pratico. Ho eliminato tutti i pagamenti rateali inutili e ora gestisco il flusso di cassa mensile senza stress.",
      "name": "Dmitry K.",
      "role": "Mosca — marketer"
    },
    {
      "text": "La guida all'autoproduzione e alla riparazione da soli vale l'intero prezzo. Finalmente ho il controllo sul mio conto bancario.",
      "name": "Claire B.",
      "role": "Parigi — insegnante"
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
    },
    {
      "text": "Som dansker elsker jeg effektivitet. Dette kursus viser præcis, hvordan Amish eliminerer økonomisk spild.",
      "name": "Anders S.",
      "role": "København - ingeniør"
    },
    {
      "text": "At administrere en familie på 4 i en dyr by er svært. Takket være Amish-planlægningsteknikker sparer jeg over 30%.",
      "name": "Sarah M.",
      "role": "Boston - mor"
    },
    {
      "text": "Svingende indkomst gav mig angst. Amish-budgettet lærte mig at opbygge stabilitet og aldrig have gæld.",
      "name": "Mateo L.",
      "role": "Madrid - freelancer"
    },
    {
      "text": "Amish-minimalisme anvendt på husholdningernes finanser er genialt. Fremragende materiale, både teoretisk og praktisk.",
      "name": "Yuki T.",
      "role": "Tokyo - analytiker"
    },
    {
      "text": "Meget praktisk metode. Jeg eliminerede alle unødvendige afdragsbetalinger og administrerer nu den månedlige pengestrøm uden stress.",
      "name": "Dmitry K.",
      "role": "Moskva - marketingmedarbejder"
    },
    {
      "text": "Vejledningen til selvproduktion og gør-det-selv-reparationer alene er hele prisen værd. Endelig har jeg kontrol over min bankkonto.",
      "name": "Claire B.",
      "role": "Paris - lærer"
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
        
        # Reset items to only have the first one
        first_item = data["testimonials"]["items"][0] if data["testimonials"]["items"] else None
        
        if first_item:
            data["testimonials"]["items"] = [first_item]
        else:
            continue

        # Add new testimonials
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
                        data["testimonials"]["items"].append(t_item)
                else:
                    data["testimonials"]["items"].append(t_item)
            print(f"Added translated/fallback testimonials to {fname}")

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("Finished adding testimonials to all files.")

if __name__ == "__main__":
    main()
