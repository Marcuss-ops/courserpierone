#!/usr/bin/env python3
"""
Translate locale JSON files using Argos Translate (offline, local, free).

Translates from English (en.json) to each target language, preserving
existing translated content and only filling in untranslated fields.

WARNING: Argos Translate is a local machine translation model. Quality
varies by language pair. Complex phrases, legal text, and numbered
items may need manual review.

Uso:
    python scripts/translate/translate-argos.py <slug> <target-locales...>
    python scripts/translate/translate-argos.py amish-secrets de fr es pt
    python scripts/translate/translate-argos.py amish-secrets all   # tutte le lingue disponibili
    python scripts/translate/translate-argos.py --force <slug> all  # sovrascrive TUTTI i campi

Prerequisiti:
    pip install argostranslate

Flag:
    --force   Ignora il merge intelligente e sovrascrive tutti i campi
              con le nuove traduzioni Argos. Utile quando en.json
              viene corretto e si vuole ripropagare tutto da zero.
"""

import sys, os, json, time, re

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed.")
    print("  Run: pip install argostranslate")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def get_available_targets():
    """Get all target language codes available for translation from English."""
    a_pkg.update_package_index()
    return sorted(set(p.to_code for p in a_pkg.get_available_packages() if p.from_code == "en"))


def get_translator(source: str, target: str):
    """Get a translator function for source-target, installing package if needed."""
    a_pkg.update_package_index()
    avail = a_pkg.get_available_packages()
    pkg = next((p for p in avail if p.from_code == source and p.to_code == target), None)
    if not pkg:
        print(f"  !! Package {source}->{target} not available", file=sys.stderr)
        return None

    installed = a_tr.get_installed_languages()
    fl = next((l for l in installed if l.code == source), None)
    tl = next((l for l in installed if l.code == target), None)

    if not fl or not tl:
        sys.stderr.write(f"  Installing {source}->{target}...\n")
        sys.stderr.flush()
        pkg.install()
        installed = a_tr.get_installed_languages()
        fl = next(l for l in installed if l.code == source)
        tl = next(l for l in installed if l.code == target)

    return fl.get_translation(tl)


def should_translate(value: str) -> bool:
    """Check if a string value should be translated."""
    if not value or not value.strip():
        return False
    if len(value) < 3:
        return False
    if value.startswith("http"):
        return False
    # Skip absolute file paths like /images/... but allow // prefixes (badges like "// The True Story")
    if re.match(r'^/[^/]', value):
        return False
    if value.startswith("{") or value.startswith("}"):
        return False
    return True


def translate_object(obj, translator) -> str:
    """Translate a single string value."""
    return translator.translate(obj)


def translate_dict(d: dict, translator, depth=0) -> dict:
    """Recursively translate all string values in a dict."""
    result = {}
    total = 0
    for key, value in d.items():
        if isinstance(value, str):
            if should_translate(value):
                try:
                    translated = translate_object(value, translator)
                    result[key] = translated
                    total += 1
                except Exception:
                    result[key] = value
            else:
                result[key] = value
        elif isinstance(value, dict):
            result[key] = translate_dict(value, translator, depth + 1)
        elif isinstance(value, list):
            result[key] = [
                translate_dict(item, translator, depth + 1) if isinstance(item, dict)
                else translate_object(item, translator) if isinstance(item, str) and should_translate(item)
                else item
                for item in value
            ]
        else:
            result[key] = value
    if depth == 0 and total > 0:
        print(f"   Tradotti {total} campi testuali")
    return result


def merge_translations(existing: dict, translated: dict, en_source: dict) -> dict:
    """
    Merge translated values into existing, preserving existing non-English text.

    Logic: if existing[key] == en_source[key], the field is still in English
    and needs translation -> use translated[key] (Argos).
    If existing[key] != en_source[key], the field was already translated
    from DB -> keep existing[key].
    """
    result = {}
    for key in existing:
        ev = existing[key]
        tv = translated.get(key)
        en_val = en_source.get(key)

        if isinstance(ev, str) and isinstance(tv, str):
            # If existing value is still English (matches source), translate it
            if ev == en_val:
                result[key] = tv if tv else ev
            else:
                result[key] = ev  # Already translated from DB, keep it
        elif isinstance(ev, dict) and isinstance(tv, dict) and isinstance(en_val, dict):
            result[key] = merge_translations(ev, tv, en_val)
        elif isinstance(ev, list) and isinstance(tv, list) and isinstance(en_val, list):
            result[key] = [
                merge_translations(e, t_item, s_item) if isinstance(e, dict) and isinstance(t_item, dict) and isinstance(s_item, dict)
                else t_item if isinstance(e, str) and isinstance(t_item, str) and isinstance(s_item, str) and e == s_item and t_item != s_item
                else e
                for e, t_item, s_item in zip(ev, tv, en_val)
            ]
            if len(ev) != len(tv) or len(ev) != len(en_val):
                result[key] = ev
        else:
            result[key] = ev
    return result


def main():
    available_targets = get_available_targets()

    # Parsing flag --force
    FORCE_MODE = "--force" in sys.argv
    if FORCE_MODE:
        sys.argv.remove("--force")
        print("\n[FORCE] mode: sovrascrivo TUTTI i campi con le nuove traduzioni.")
        print("   I valori esistenti verranno persi!\n")

    if len(sys.argv) < 3:
        print(f"""
Uso: python scripts/translate/translate-argos.py <slug> <target-locales...>
     python scripts/translate/translate-argos.py amish-secrets de fr es pt
     python scripts/translate/translate-argos.py amish-secrets all
     python scripts/translate/translate-argos.py --force <slug> all

Flag: --force   Ignora il merge e sovrascrive TUTTI i campi

Lingue disponibili da EN ({len(available_targets)}): {', '.join(available_targets)}
""")
        sys.exit(1)

    print("\nWARNING: Argos Translate quality varies. Review translated text manually.")
    print("Especially check: legal notes, numbered items, names, and complex phrases.\n")

    slug = sys.argv[1]
    targets = sys.argv[2:]

    if "all" in targets:
        targets = available_targets

    slug_dir = os.path.join(DATA_DIR, slug)
    en_file = os.path.join(slug_dir, "en.json")

    if not os.path.exists(en_file):
        print(f"ERROR: {en_file} not found. Run extract-locales.ts first.")
        sys.exit(1)

    with open(en_file, "r", encoding="utf-8") as f:
        en_data = json.load(f)

    print(f"--- {slug}: traduzione da EN -> {', '.join(targets)} ---\n")

    for target in targets:
        target = target.lower().strip()
        if target == "en":
            continue
        if target not in available_targets:
            print(f"   .. {target}: package EN->{target} not available, skipping")
            continue

        out_file = os.path.join(slug_dir, f"{target}.json")

        # Carica esistente se presente
        existing = None
        if os.path.exists(out_file):
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
            print(f"   ## {target}: merging with existing ({len(json.dumps(existing))} bytes)")

        # Ottieni traduttore
        sys.stderr.write(f"   @@ {target}: getting translator...\n")
        sys.stderr.flush()
        translator = get_translator("en", target)
        if not translator:
            print(f"   XX {target}: could not get translator")
            continue

        # Traduci tutto da EN
        print(f"   >> {target}: translating...")
        t0 = time.time()
        translated = translate_dict(en_data, translator)
        elapsed = time.time() - t0
        print(f"   ~~ {elapsed:.1f}s")

        # Merge con esistente (preserva traduzioni DB esistenti)
        if existing:
            if FORCE_MODE:
                print(f"   !! {target}: force mode — ignoring existing values")
                merged = translated
            else:
                merged = merge_translations(existing, translated, en_data)
        else:
            merged = translated

        # Fix locale field
        merged["locale"] = target

        # Salva
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)

        print(f"   OK {target}.json saved\n")

    print(f"OK Done! Translated {', '.join(targets)} for {slug}\n")


if __name__ == "__main__":
    main()
