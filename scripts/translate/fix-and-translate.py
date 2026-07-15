import os
import json
import sys
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed.")
    sys.exit(1)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = None  # computed in main() from argv <slug>
CONFIG_PATH = None  # computed in main() from argv <slug>

ITALIAN_FALLBACKS = ["pagamento sicuro", "recensioni verificate", "ssl sicuro", "fattura inclusa", "ritiro"]

def get_translator(source: str, target: str):
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
            print(f"Installing package {source}->{target}...")
            pkg.install()
            installed = a_tr.get_installed_languages()
            fl = next(l for l in installed if l.code == source)
            tl = next(l for l in installed if l.code == target)

        return fl.get_translation(tl)
    except Exception as e:
        print(f"Failed to load/install translator for {source}->{target}: {e}")
        return None

def main():
    global DATA_DIR, CONFIG_PATH
    if len(sys.argv) < 2:
        print("Usage: python fix-and-translate.py <slug>")
        sys.exit(1)
    slug = sys.argv[1]
    DATA_DIR = os.path.join(ROOT_DIR, "data", slug)
    CONFIG_PATH = os.path.join(ROOT_DIR, "public", "courses", slug, "config.json")
    if not os.path.exists(CONFIG_PATH):
        print(f"Error: {CONFIG_PATH} not found.")
        sys.exit(1)

    print("Reading config.json...")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    # 1. Merge English & Italian labels from config.json into data/json files
    en_config_labels = config["languages"]["en"]["ui"]["labels"]
    it_config_labels = config["languages"]["it"]["ui"]["labels"]

    en_json_path = os.path.join(DATA_DIR, "en.json")
    it_json_path = os.path.join(DATA_DIR, "it.json")

    with open(en_json_path, "r", encoding="utf-8") as f:
        en_data = json.load(f)
    with open(it_json_path, "r", encoding="utf-8") as f:
        it_data = json.load(f)

    # Update en.json and it.json labels
    en_data["ui"]["labels"].update(en_config_labels)
    it_data["ui"]["labels"].update(it_config_labels)

    # Ensure author bio fields are also updated/copied to top-level sections if needed
    # (validation script checks author.bio placeholder)
    if "author" in en_data:
        en_data["author"]["bio"] = en_config_labels.get("author_bio_1", en_data["author"]["bio"])
    if "author" in it_data:
        it_data["author"]["bio"] = it_config_labels.get("author_bio_1", it_data["author"]["bio"])

    with open(en_json_path, "w", encoding="utf-8") as f:
        json.dump(en_data, f, indent=2, ensure_ascii=False)
    with open(it_json_path, "w", encoding="utf-8") as f:
        json.dump(it_data, f, indent=2, ensure_ascii=False)

    print("Updated en.json and it.json from config.json labels.")

    # 2. Iterate through all other locale files and translate missing/incorrect keys
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f not in ("en.json", "it.json")]

    for fname in sorted(files):
        lang = fname.split(".")[0].lower()
        filepath = os.path.join(DATA_DIR, fname)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        if "ui" not in data or "labels" not in data["ui"]:
            data["ui"] = {"labels": {}}

        labels = data["ui"]["labels"]
        translator = None
        updated = False

        # Check all keys from en_data's ui.labels
        for key, en_val in en_data["ui"]["labels"].items():
            curr_val = labels.get(key, "")
            is_fallback = False

            # Check if current value is blank, English reference, Italian fallback, or placeholder brackets
            if not curr_val or curr_val.strip() == "":
                is_fallback = True
            elif curr_val.strip() == en_val.strip() and len(en_val) > 20: # English untranslated
                is_fallback = True
            elif any(fb in curr_val.lower() for fb in ITALIAN_FALLBACKS): # Italian leakage
                is_fallback = True
            elif "[" in curr_val and "]" in curr_val: # Placeholder brackets
                is_fallback = True

            if is_fallback:
                if not translator:
                    translator = get_translator("en", lang)
                    if not translator:
                        print(f"No translator for en -> {lang}. Skipping key fixes for this file.")
                        break

                print(f"Translating key '{key}' to {lang}: '{en_val}'")
                try:
                    translated = translator.translate(en_val)
                    # Clean up translated bracket placeholders if the translator kept them
                    translated = re.sub(r'\[|\]', '', translated).strip()
                    labels[key] = translated
                    updated = True
                except Exception as e:
                    print(f"  Error translating '{en_val}': {e}")

        # Also check author.bio for brackets
        if "author" in data and "bio" in data["author"]:
            bio_val = data["author"]["bio"]
            if ("[" in bio_val and "]" in bio_val) or any(fb in bio_val.lower() for fb in ITALIAN_FALLBACKS) or bio_val == en_data["author"]["bio"]:
                if not translator:
                    translator = get_translator("en", lang)
                if translator:
                    print(f"Translating bio to {lang}")
                    try:
                        translated_bio = translator.translate(en_data["author"]["bio"])
                        translated_bio = re.sub(r'\[|\]', '', translated_bio).strip()
                        data["author"]["bio"] = translated_bio
                        labels["author_bio"] = translated_bio
                        updated = True
                    except Exception as e:
                        print(f"  Error translating bio: {e}")

        if updated:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Successfully saved fixes for {fname}")

    print("\nFixes and translations completed successfully!")

if __name__ == "__main__":
    main()
