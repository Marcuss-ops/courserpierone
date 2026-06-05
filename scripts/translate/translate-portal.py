import os
import json
import sys

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed. Run: pip install argostranslate")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "amish-secrets")
EN_FILE = os.path.join(DATA_DIR, "en.json")

# The 17 portal keys to translate (English source)
PORTAL_KEYS = [
    "access_badge",
    "welcome_text",
    "video_title",
    "video_desc",
    "lessons_count_label",
    "start_label",
    "ebook_title",
    "ebook_desc",
    "format_label",
    "read_label",
    "community_title",
    "community_desc",
    "community_privata",
    "join_label",
    "extra_title",
    "extra_desc",
    "coming_soon",
]


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
        print(f"  Installing package {source}->{target}...")
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

    en_portal = en_data.get("portal", {})
    if not en_portal:
        print("Error: No 'portal' section found in en.json")
        sys.exit(1)

    # Skip en.json and it.json (already translated)
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f not in ("en.json", "it.json")]

    total = len(files)
    success = 0
    skipped = 0

    for idx, fname in enumerate(sorted(files), 1):
        lang = fname.split(".")[0].lower()
        target_file = os.path.join(DATA_DIR, fname)

        print(f"\n[{idx}/{total}] Translating portal keys for {lang} ({fname})...")

        translator = get_translator("en", lang)
        if not translator:
            print(f"  Warning: No translator for en -> {lang}, skipping")
            skipped += 1
            continue

        try:
            with open(target_file, "r", encoding="utf-8") as f:
                target_data = json.load(f)

            # Initialize portal section if missing
            if "portal" not in target_data:
                target_data["portal"] = {}

            # Translate each portal key
            translated = {}
            for key in PORTAL_KEYS:
                en_text = en_portal.get(key, "")
                if en_text:
                    try:
                        translated[key] = translator.translate(en_text)
                    except Exception as e:
                        print(f"  Warning: Failed to translate '{key}': {e}")
                        translated[key] = en_text  # fallback to English

            target_data["portal"] = translated

            with open(target_file, "w", encoding="utf-8") as f:
                json.dump(target_data, f, indent=2, ensure_ascii=False)

            print(f"  OK Translated {len(translated)} portal keys")
            success += 1

        except Exception as e:
            print(f"  Error translating {lang}: {e}")
            skipped += 1

    print(f"\n{'='*50}")
    print(f"Portal translation complete!")
    print(f"  Translated: {success} languages")
    print(f"  Skipped: {skipped} languages")
    print(f"  Total: {total} languages")


if __name__ == "__main__":
    main()
