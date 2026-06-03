
import sys, json, os
os.environ["ARGOS_DEVICE_TYPE"] = "cpu"

try:
    import argostranslate.package
    import argostranslate.translate

    from_code = "it"
    to_code = "de"

    # Aggiorna indice
    argostranslate.package.update_package_index()
    avail = argostranslate.package.get_available_packages()

    # Trova e installa pacchetto
    pkg = next((p for p in avail if p.from_code == from_code and p.to_code == to_code), None)
    if pkg:
        installed = argostranslate.translate.get_installed_languages()
        fl = next((l for l in installed if l.code == from_code), None)
        tl = next((l for l in installed if l.code == to_code), None)
        if not fl or not tl:
            print(f"Downloading {from_code} -> {to_code}...", file=sys.stderr)
            pkg.install()

    # Traduci
    installed = argostranslate.translate.get_installed_languages()
    fl = next(l for l in installed if l.code == from_code)
    tl = next(l for l in installed if l.code == to_code)
    tr = fl.get_translation(tl)
    result = tr.translate("Chapter")
    print(result)
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
