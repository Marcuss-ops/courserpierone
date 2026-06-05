"""
translate-missing.py — Traduci tutte le chiavi mancanti per un prodotto.

Uso:
  python scripts/translate/translate-missing.py
    -> Traduce portal + course per amish-secrets

  python scripts/translate/translate-missing.py --product amish-secrets --all
    -> Traduce TUTTE le sezioni mancanti per amish-secrets

  python scripts/translate/translate-missing.py --product amish-secrets --section portal --section course
    -> Solo sezioni specifiche

  python scripts/translate/translate-missing.py --product amish-secrets --dry-run
    -> Mostra cosa tradurrebbe senza scrivere
"""

import os
import json
import sys
import argparse
from typing import Dict, List, Optional, Set, Tuple

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed. Run: pip install argostranslate")
    sys.exit(1)


# ─── Config ─────────────────────────────────────────────────────

SKIP_LOCALES = {"en"}  # source language, never translate
MANUAL_LOCALES = {"it"}  # already manually translated
SKIP_KEYS = {"locale"}  # never translate these keys
SKIP_SECTIONS = {"seo"}  # skip SEO (titles shouldn't be auto-translated)

# Sezioni di default tradotte dallo script
DEFAULT_SECTIONS = ["portal", "course"]


# ─── Helpers ────────────────────────────────────────────────────

def get_translator(source: str, target: str):
    """Get or install a translator for source->target language pair."""
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


def get_all_leaf_keys(obj: dict, prefix: str = "") -> List[Tuple[str, str, str]]:
    """
    Flatten a nested JSON object into a list of (section, key_path, value) tuples.
    Only terminal string values are included.
    """
    results = []
    for k, v in obj.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            # Check if this dict contains only primitive values (leaf section)
            has_nested = any(isinstance(x, dict) for x in v.values())
            if has_nested:
                results.extend(get_all_leaf_keys(v, path))
            else:
                section = prefix if prefix else k
                for sub_k, sub_v in v.items():
                    if isinstance(sub_v, str):
                        results.append((section, sub_k, sub_v))
        elif isinstance(v, str) and v:
            results.append((prefix, k, v))
    return results


def find_missing_strings(
    en_data: dict,
    target_data: dict,
    sections: Optional[List[str]] = None,
) -> Dict[str, Dict[str, str]]:
    """
    Find strings in target_data that are the same as en_data (i.e., not translated).
    Returns {section: {key: english_text}} for keys that need translation.
    Optionally restrict to specific sections.
    """
    missing: Dict[str, Dict[str, str]] = {}

    en_flat = get_all_leaf_keys(en_data)
    for section, key, en_text in en_flat:
        if key in SKIP_KEYS:
            continue
        if sections and section not in sections:
            continue
        if section in SKIP_SECTIONS:
            continue

        # Navigate to the same key in target_data
        target_val = target_data.get(section, {}).get(key) if section else target_data.get(key)

        # If missing or still English -> needs translation
        if target_val is None or target_val == en_text:
            if section not in missing:
                missing[section] = {}
            missing[section][key] = en_text

    return missing


def translate_missing(
    en_data: dict,
    target_data: dict,
    translator,
    sections: Optional[List[str]] = None,
    dry_run: bool = False,
) -> Tuple[int, int]:
    """
    Translate missing strings from en_data into target_data using translator.
    Returns (translated_count, skipped_count).
    """
    missing = find_missing_strings(en_data, target_data, sections)
    translated_count = 0
    skipped_count = 0

    for section, keys in missing.items():
        if not keys:
            continue
        if section not in target_data:
            target_data[section] = {}

        for key, en_text in keys.items():
            if dry_run:
                print(f"  Would translate [{section}].{key}: \"{en_text}\"")
                translated_count += 1
                continue

            try:
                translated = translator.translate(en_text)
                if translated and translated != en_text:
                    target_data[section][key] = translated
                    translated_count += 1
                else:
                    target_data[section][key] = en_text  # fallback to English
                    if not translated:
                        skipped_count += 1
            except Exception as e:
                print(f"  Warning: Failed to translate [{section}].{key}: {e}")
                target_data[section][key] = en_text
                skipped_count += 1

    return translated_count, skipped_count


def main():
    parser = argparse.ArgumentParser(description="Translate missing locale keys for a product")
    parser.add_argument("--product", default="amish-secrets", help="Product slug (directory under data/)")
    parser.add_argument("--section", action="append", dest="sections",
                        help="Section(s) to translate (e.g. --section portal --section course)")
    parser.add_argument("--all", action="store_true",
                        help="Translate ALL sections, not just defaults")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be translated without writing files")
    parser.add_argument("--force", action="store_true",
                        help="Re-translate even manually translated locales (it)")

    args = parser.parse_args()

    sections = args.sections or (None if args.all else DEFAULT_SECTIONS)
    if args.all:
        print(f"Mode: translate ALL sections")
    elif sections:
        print(f"Mode: translate sections: {', '.join(sections)}")
    else:
        print(f"Mode: translate default sections: {', '.join(DEFAULT_SECTIONS)}")

    product_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", args.product)
    en_file = os.path.join(product_dir, "en.json")

    if not os.path.exists(product_dir):
        print(f"Error: Product directory not found: {product_dir}")
        sys.exit(1)
    if not os.path.exists(en_file):
        print(f"Error: en.json not found in {product_dir}")
        sys.exit(1)

    # Load English source
    with open(en_file, "r", encoding="utf-8") as f:
        en_data = json.load(f)

    # Load all locale files
    files = [f for f in os.listdir(product_dir) if f.endswith(".json")]
    skip = set(SKIP_LOCALES)
    if not args.force:
        skip.update(MANUAL_LOCALES)

    locale_files = [f for f in files if f.replace(".json", "").lower() not in skip]

    total_files = len(locale_files)
    total_translated = 0
    total_skipped = 0
    total_missing_found = 0

    print(f"\nProduct: {args.product}")
    print(f"Locale files to translate: {total_files}\n")

    for idx, fname in enumerate(sorted(locale_files), 1):
        lang = fname.replace(".json", "").lower()
        target_file = os.path.join(product_dir, fname)

        print(f"[{idx}/{total_files}] {lang} ({fname})...")

        translator = get_translator("en", lang)
        if not translator:
            print(f"  Skipping (no translator available for en -> {lang})")
            total_skipped += 1
            continue

        try:
            with open(target_file, "r", encoding="utf-8") as f:
                target_data = json.load(f)

            if not args.dry_run:
                translated, skipped = translate_missing(
                    en_data, target_data, translator, sections, dry_run=False
                )
                total_translated += translated
                total_skipped += skipped

                total_missing_found += translated + skipped

                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(target_data, f, indent=2, ensure_ascii=False)

                if translated + skipped == 0:
                    print(f"  Nothing to translate (all strings are already localized)")
                else:
                    print(f"  OK: {translated} translated, {skipped} skipped")
            else:
                # Dry run: count missing without translating
                missing = find_missing_strings(en_data, target_data, sections)
                missing_count = sum(len(keys) for keys in missing.values())
                total_missing_found += missing_count

                if missing_count == 0:
                    print(f"  Nothing to translate (all strings are already localized)")
                else:
                    for sec, keys in missing.items():
                        for key, val in keys.items():
                            print(f"  Would translate [{sec}].{key}: \"{val}\"")
                    total_translated += missing_count
                    print(f"  (dry run: {missing_count} strings would be translated)")

            else:
                # Dry run: just show what would be translated
                for sec, keys in missing.items():
                    for key, val in keys.items():
                        print(f"  Would translate [{sec}].{key}: \"{val}\"")
                total_translated += missing_count
                print(f"  (dry run: {missing_count} strings would be translated)")

        except Exception as e:
            print(f"  Error: {e}")
            total_skipped += 1

    # Summary
    print(f"\n{'='*55}")
    print(f"  Translation complete for {args.product}")
    if args.dry_run:
        print(f"  Total strings that would be translated: {total_translated}")
    else:
        print(f"  Total strings translated: {total_translated}")
        print(f"  Total skipped: {total_skipped}")
    print(f"  Total missing found: {total_missing_found}")
    print(f"{'='*55}\n")

    # If dry run, suggest the real command
    if args.dry_run and total_missing_found > 0:
        sections_arg = ""
        if sections and sections != DEFAULT_SECTIONS:
            sections_arg = " " + " ".join(f"--section {s}" for s in sections)
        elif sections is None and args.all:
            sections_arg = " --all"
        print(f"Tip: run the real translation with:\n")
        print(f"  python scripts/translate/translate-missing.py"
              f" --product {args.product}{sections_arg}\n")


if __name__ == "__main__":
    main()
