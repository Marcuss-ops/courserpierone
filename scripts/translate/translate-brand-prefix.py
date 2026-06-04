import os
import json
import sys

os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package as a_pkg
    import argostranslate.translate as a_tr
except ImportError:
    print("ERROR: argostranslate not installed.")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "amish-secrets")

# Manual mapping overrides for high precision on major languages
BRAND_OVERRIDES = {
    "it": "I Segreti degli Amish",
    "es": "Secretos Amish",
    "pt": "Segredos Amish",
    "pb": "Segredos Amish",
    "fr": "Secrets Amish",
    "de": "Amish-Geheimnisse",
    "nl": "Geheimen van de Amish",
    "pl": "Tajemnice Amiszów",
    "ru": "Секреты Амишей",
    "ar": "أسرار الأميش",
    "ja": "アーミッシュの秘密",
    "ko": "아미쉬의 비밀",
    "zh": "阿米什人的秘密",
    "zt": "阿米什人的秘密"
}

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
        pkg.install()
        installed = a_tr.get_installed_languages()
        fl = next(l for l in installed if l.code == source)
        tl = next(l for l in installed if l.code == target)

    return fl.get_translation(tl)

def main():
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f != "en.json"]

    for fname in sorted(files):
        lang = fname.split(".")[0].lower()
        target_file = os.path.join(DATA_DIR, fname)

        # Get brand translation
        translated_brand = BRAND_OVERRIDES.get(lang)
        if not translated_brand:
            translator = get_translator("en", lang)
            if translator:
                try:
                    translated_brand = translator.translate("Amish Secrets").strip()
                except Exception:
                    translated_brand = "Amish Secrets"
            else:
                translated_brand = "Amish Secrets"

        # Safe print for Windows console
        print(f"Translating brand for {lang}...")

        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Helper to replace brand prefix
        def replace_brand(text: str) -> str:
            if not isinstance(text, str):
                return text
            # Replace case insensitive variants of Amish Secrets
            for variant in ["Amish Secrets:", "Amish secrets:", "Amish Secrets", "Amish secrets"]:
                if text.startswith(variant):
                    sep = ":" if variant.endswith(":") else ""
                    rest = text[len(variant):].strip()
                    if rest.startswith(":"):
                        rest = rest[1:].strip()
                        sep = ":"
                    return f"{translated_brand}{sep} {rest}".strip()
            return text

        # Update fields
        if "seo" in data:
            if "title" in data["seo"]:
                data["seo"]["title"] = replace_brand(data["seo"]["title"])
        if "hero" in data:
            if "title" in data["hero"]:
                data["hero"]["title"] = replace_brand(data["hero"]["title"])
        if "nav" in data:
            if "brand" in data["nav"]:
                data["nav"]["brand"] = translated_brand
        if "ui" in data and "labels" in data["ui"]:
            labels = data["ui"]["labels"]
            for key in ["brand_name", "nav_brand", "title", "hero_title", "ebookTitle"]:
                if key in labels:
                    labels[key] = replace_brand(labels[key])

        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("\nBrand name prefix translations completed successfully!")

if __name__ == "__main__":
    main()
