import os
import json
import sys
import re

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed.")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "amish-secrets")
EN_FILE = os.path.join(DATA_DIR, "en.json")

def get_translator(source: str, target: str):
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

def main():
    if not os.path.exists(EN_FILE):
        print(f"Error: {EN_FILE} not found.")
        sys.exit(1)

    with open(EN_FILE, "r", encoding="utf-8") as f:
        en_data = json.load(f)

    # Extract source texts
    source_seo_title = en_data["seo"]["title"]
    source_seo_desc = en_data["seo"]["description"]
    source_hero_title = en_data["hero"]["title"]
    source_hero_subtitle = en_data["hero"]["subtitle"]

    print(f"Source SEO Title: {source_seo_title}")
    print(f"Source SEO Desc: {source_seo_desc}")

    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f not in ("en.json", "it.json")]

    for fname in sorted(files):
        lang = fname.split(".")[0].lower()
        target_file = os.path.join(DATA_DIR, fname)

        print(f"\nTranslating for {lang} ({fname})...")
        translator = get_translator("en", lang)
        if not translator:
            print(f"  Warning: No translator for en -> {lang}")
            continue

        try:
            trans_seo_title = translator.translate(source_seo_title)
            trans_seo_desc = translator.translate(source_seo_desc)
            trans_hero_title = translator.translate(source_hero_title)
            trans_hero_subtitle = translator.translate(source_hero_subtitle)
        except Exception as e:
            print(f"  Translation error for {lang}: {e}")
            continue

        with open(target_file, "r", encoding="utf-8") as f:
            target_data = json.load(f)

        # Update specific keys
        if "seo" not in target_data:
            target_data["seo"] = {}
        target_data["seo"]["title"] = trans_seo_title
        target_data["seo"]["description"] = trans_seo_desc

        if "hero" not in target_data:
            target_data["hero"] = {}
        target_data["hero"]["title"] = trans_hero_title
        target_data["hero"]["subtitle"] = trans_hero_subtitle

        # Also update the ebookTitle in config/ui.labels if it exists
        if "ui" in target_data and "labels" in target_data["ui"]:
            labels = target_data["ui"]["labels"]
            if "hero_subtitle" in labels:
                labels["hero_subtitle"] = trans_hero_subtitle

        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(target_data, f, indent=2, ensure_ascii=False)

        print(f"  Successfully updated {fname}")

    print("\nSelective translation completed successfully!")

if __name__ == "__main__":
    main()
