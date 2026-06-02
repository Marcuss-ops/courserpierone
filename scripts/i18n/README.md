# `scripts/i18n/` — Internationalization Scripts

> Scripts per gestire traduzioni UI globali e seeding delle 71 lingue.

## File

| Script | Descrizione |
|---|---|
| `seed-locales.ts` | Seed tabella Locale (copiato da `../db/` per organizzazione) |

## Note

La maggior parte degli script i18n sono in `scripts/db/` (`seed-locales.ts`, `seed-ui-translations.ts`).
Questa directory è预留 per future script di analisi o migrazione traduzioni.

## 71 lingue supportate

```
it-it, en-us, en-gb, fr-fr, de-de, es-es, pt-pt, pt-br,
nl-nl, pl-pl, sv-se, da-dk, nb-no, no-no, fi-fi, ro-ro,
cs-cz, hu-hu, el-gr, ja-jp, ko-kr, zh-cn, zh-tw, zh-hk,
ar-sa, ar-ae, ar-eg, hi-in, tr-tr, th-th, vi-vn, id-id,
ms-my, en-sg, en-au, en-nz, en-ca, fr-ca, es-mx, es-ar,
es-co, es-cl, es-pe, en-za, en-ng, en-ke, fr-ma, ru-ru,
uk-ua, he-il, bn-bd, ur-pk, sk-sk, sl-si, hr-hr, lt-lt,
lv-lv, et-ee, bg-bg, en-ie, de-at, de-ch, fr-ch, it-ch,
en-ph, pk-pk, ng-ng, ke-ke, za-za, ma-ma, bd-bd
```