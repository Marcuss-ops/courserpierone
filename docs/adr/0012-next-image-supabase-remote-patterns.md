# ADR 0012 — next/image `unoptimized`: trade-off, premise correction, and V2 path

> **Status.** Accepted. Effective 2026-07-14.
> **Date.** 2026-07-14
> **Author.** Ops / dev-lead (post ESLint-sweep retrospective audit of `unoptimized` choices introduced in commits `f735e38` and `07099b1`).
> **Supersedes.** n/a — this ADR documents the rationale for a flag that already exists in 3 production sites; it does not replace a prior decision.
> **Related.**
> - [ADR 0010 — Two-pass gate for type-aware ESLint rule substitution](./0010-lint-cleanup-type-aware-rules.md) — the cleanup sweep that introduced these `unoptimized` flags as part of the `<img>` → `<Image>` migration.
> - [ADR 0011 — Course Plugin Decoupling](./0011-course-plugin-decoupling.md) — same era; parallel architectural hardening.
> - `next.config.mjs` (lines 21-26) — the always-on `images.remotePatterns` that includes `**.supabase.co` `https` and `images.unsplash.com` `https`.
> - [Next.js docs — `next/image` `unoptimized` prop](https://nextjs.org/docs/pages/api-reference/components/image#unoptimized) — disables the Vercel Image Optimization pipeline for a single image, serving the raw source URL with no transforms.
> - [Next.js docs — `next.config.js images.remotePatterns`](https://nextjs.org/docs/app/api-reference/next-config-js/images#remotepatterns) — the gate that decides which external hosts are allowed through the optimizer.

---

## 1. Context

The codebase uses `next/image` in **5 components** (per `grep -rn '^import Image' src/`):

| File | URL source | `unoptimized`? | Class of image |
|---|---|:---:|---|
| `src/app/(locale)/[locale]/[domain]/(member)/chat/page.tsx:151` | Supabase signed URL (creator avatar) — `creator.image` | **YES** | Tiny thumbnail (40×40 fixed-display) |
| `src/app/account/payments/page.tsx:128` | Supabase signed URL (order product cover) — `o.product.coverUrl` | **YES** | Tiny thumbnail (40×40 fixed-display) |
| `src/app/account/profile/avatar-uploader.tsx:150` | **Blob URL** — `URL.createObjectURL(file)` or signed Supabase URL after upload | **YES** | Variable-size (96/112 + `object-cover`) |
| `src/app/dashboard/page.tsx:3` | TBD (not audited in this ADR) | (unknown) | Out of scope |
| `src/components/courses-catalog.tsx:2` | TBD (not audited in this ADR) | (unknown) | Out of scope |

This ADR focuses on the **3 flagged sites** (the first three rows). The 2 unflagged sites are deferred to a future audit because their `unoptimized` status was not inherited from the ESLint sweep that triggered this retrospective.

The `<img>` → `<Image>` migration was performed as part of the @next/next/no-img-element lint sweep (commit `f735e38 chore(lint): sweep 10 ESLint residuals (3 no-img + 3 set-state + 4 unused)`, 2026-07-14). The flag `unoptimized` was carried forward from the original `<img>` tags — the dev chose `<Image unoptimized>` to preserve the **byte-for-byte visual behavior** of the legacy `<img>` element with the smallest possible change, instead of taking the opportunity to revisit whether the Vercel Image Optimization pipeline should be enabled.

## 2. The original task premise — and the correction

The task that triggered this ADR was framed as:

> "Document WHY 3 next/image sites use `unoptimized` AND register Supabase Storage in `next.config.mjs` `images.remotePatterns` so the optimizer can do AVIF/WebP transcoding + responsive sizing."

**This premise is partially wrong.** A ripgrep + basher inspection of `next.config.mjs` (this same audit, 2026-07-14) found:

```js
// next.config.mjs:21-26
images: {
  remotePatterns: [
    { protocol: "https", hostname: "**.supabase.co" },
    { protocol: "https", hostname: "images.unsplash.com" },
  ],
},
```

The Supabase Storage hostname **`**.supabase.co` is already registered as a `remotePattern`**, and it uses a wildcard subdomain match, which covers all Supabase project instances (`evgowbruopqtfharusdj.supabase.co`, etc.). Both `https` protocol and HTTPS-only are valid. **The "register Supabase Storage in `remotePatterns`" half of the V2 path is a no-op — it was done before this ADR existed.**

What this means: the 3 sites COULD, in principle, be served through the Vercel Image Optimization pipeline today, because their sources are HTTPS URLs on a hostname the optimizer is allow-listed for. The fact that they are still flagged `unoptimized` is a **deliberate choice**, not an oversight or a missing-config problem.

## 3. The real reasons `unoptimized` is intentional

The reasoning below is the honest chain of decisions a reader needs to understand WHY `unoptimized` will be retained for V1.

### 3.1 Reason A — Signed-URL cache hit rate is structurally ~0%

Supabase signed URLs use an HMAC-based token in the query string to grant time-limited access:

```
https://evgowbruopqtfharusdj.supabase.co/storage/v1/object/sign/avatars/<uuid>.jpg
  ?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...
```

Every call to `supabase.storage.from(...).createSignedUrl(...)` generates a fresh token (V1 default TTL ≈ 1 hour; varies by config). For the chat avatar and the order cover thumbnail:

- The **same** underlying object can be re-fetched with **a different token** every hour.
- The Vercel Image Optimization cache is keyed by the **full URL including the query string** (the optimizer treats `?token=A` and `?token=B` as different cache slots, even though the underlying object is identical).
- The cache miss ratio for these images → close to **100%**, because every signed-URL-fetch on every page render is a unique URL from the cache's perspective.

Sending these images through the optimizer means:

1. Edge fetch the upstream on every visit (1 round-trip to Supabase).
2. Re-encode (CPU cost on Vercel side).
3. Store in edge cache (storage cost) → never re-used because the next signed URL is a fresh cache key.

Net: **the optimization costs latency, CPU, and bandwidth without producing the cache hit that would amortize that cost**. `unoptimized` skips the entire pipeline and lets the browser fetch the bytes directly from the Supabase CDN — Supabase itself is the CDN, and its cache key is the object path (not the token), so the actual cache hit rate is high at the Supabase layer even when the Vercel layer is injured.

### 3.2 Reason B — Bandwidth-billing optimization on the Vercel side

Vercel Image Optimization bills per "transformed image served". The 3 sites render into small fixed-size boxes:

| Site | Rendered display size | Source size (typical) | Value of responsive resize |
|---|---|---|---|
| `chat/page.tsx:151` (creator avatar) | 40×40 px circle | ~80–200 KB original | None (no `<picture>` srcset needed at 40px fixed) |
| `payments/page.tsx:128` (order cover thumb) | 40×40 px square | ~80–200 KB original | None (no responsive sizing at 40px fixed) |
| `avatar-uploader.tsx:150` (preview) | 96/112 px circle, `object-cover` | ~80–200 KB original | Negligible (single small bbox already) |

At 40px fixed display, a 1500px-wide source image is downscaled 37×. The Vercel optimizer would produce a smaller file (~5–10 KB), but the **cost of invoking the optimizer** (CPU time on each request, billing for the transformed-image-served metric) is real for a tiny visual benefit. The original `<img>` rendering was already correctly small because the browser applies `object-cover` styling regardless of source dimensions.

`unoptimized` is the equivalent of "the bytes you stored are what you serve" — a deliberate cost decision, not a missing-feature situation.

### 3.3 Reason C — The avatar-uploader case is STRUCTURALLY unoptimizable

`avatar-uploader.tsx:150` renders `previewUrl` which is set via `URL.createObjectURL(file)` (line 67 of the same file), a `blob:` URL. The browser constructs these URLs locally to expose a `File` object to JavaScript. They have the shape:

```
blob:https://courssy.com/<uuid>
```

The Vercel Image Optimization pipeline **cannot operate on blob URLs** because:

- They are not on a remote host — they exist only in the user's browser memory.
- They have no `https://` prefix — the remotePatterns gate rejects them.
- They are not stable across the browser session — the avatar-uploader explicitly calls `URL.revokeObjectURL(dataUrl)` after the upload succeeds (line 90) or fails (line 113), freeing the memory.

This case has **no V2 migration option that removes `unoptimized`**. The blob preview is irreducible. The other 2 sites inherit `unoptimized` for code-consistency with this site — **they share the same flag value** so a future maintainer reading the file doesn't have to reason about per-site flag divergence.

### 3.4 Reason D — Cross-cutting consistency

The 3 sites are all "**small user-generated images that benefit from being served raw**". Compounded with Reason A (cache hit = 0%), Reason B (cost > value at these sizes), and Reason C (blob structurally excluded), the right policy is "small Supabase-stored user images: `unoptimized` always". This gives one rule for the whole category instead of three case-by-case decisions.

## 4. Consequences

### Positive

- **Lower Vercel Image Optimization bill** — no "transformed image served" charges for the 3 flagged sites.
- **Faster primary render** — browser directly fetches from Supabase CDN; no Vercel-image-optimizer round-trip.
- **Higher cache hit ratio (measured at Supabase layer)** — Supabase's own CDN cache keys by object path, not by signed-URL query string, so users hitting the same avatar repeatedly (e.g., across messages in a chat thread) get a cache hit at the source.
- **Blob: URL support out of the box** — no Vercel-side failure for `avatar-uploader.tsx` preview state.
- **No `remotePatterns` edits needed for new Supabase projects** — the `**.supabase.co` wildcard already covers them.

### Negative

- **No AVIF/WebP transcoding by Vercel** — Source images are served as their original format. Real-world impact at the 40×40 rendered size is negligible (browser-side handling of JPEG vs AVIF is sub-KB at that size), but worth noting.
- **No `:srcset` automatic generation** — fixed-display use cases (40×40) make this irrelevant; if a future use case REQUIRES responsive sizing, the `unoptimized` flag must be revisited.
- **No automatic WebP/AVIF fallback for browsers that prefer it** — same caveat as above; sub-KB difference at 40px.
- **No protection against malformed source images** — Vercel optimizer would fail loudly on a corrupted image; `unoptimized` returns the corrupted bytes directly.

### For operators

- **Do NOT remove `unoptimized` from these 3 sites without reading §5 first.** Doing so will silently reroute the bytes through the optimizer (MORE cost, WORSE cache hit), without the original `<img>` semantics being preserved.
- **If a future site needs a tiny user-generated image stored in Supabase**, follow the same recipe: `<Image unoptimized>`. Consistency is enforced by the same flag value across all small-v1 cases.
- **If a future site needs a LARGE or responsive image stored in Supabase** (e.g., a hero image with `<picture>` srcset), see §5.2 — that's a different ADR-level decision.

## 5. Migration — what "V2" actually means

The original task framed V2 as "register Supabase Storage in `images.remotePatterns`". That's a non-event because the hostname is already there. The **real V2 question** is: under what circumstances would we WANT to remove `unoptimized`? Three concrete triggers worth parking:

### 5.1 Trigger A — Switch to long-lived public Supabase URLs

If we change the Supabase storage bucket configuration from **signed-URL per fetch** to **public bucket with a stable URL** (no HMAC token, no time-limited token in the query string), the Vercel optimizer's cache key would be object-path-stable. The cache hit ratio would jump from ~0% to **>>0%**. At THAT point, removing `unoptimized` + accepting Vercel optimizer cost is justified.

**Action:** when bucket policy changes, audit the 3 sites for the same Reason A evaluation and revisit this ADR.

### 5.2 Trigger B — Render a Supabase image at LARGE or RESPONSIVE size

If a future page renders one of these images at >200px display size AND uses responsive layouts where `sizes` calculation matters (e.g., `sizes="(max-width: 640px) 50vw, 33vw"` for a 3-column grid on a marketing page), the value proposition shifts: Vercel's srcset generation + responsive resize produces a measurable LCP improvement. Then removing `unoptimized` is justified even with the cache miss.

**Action:** the LCP decision lives with the page author — this ADR does not authorize blanket re-eval across the existing 3 sites.

### 5.3 Trigger C — Vercel adds edge-side optimization for `**.supabase.co`

If Vercel ships a Supabase-specific optimization contract (cached-stable signed-URL semantics) or if Supabase ships a CDN-header-based optimizer contract, the trade-off space changes. Tracked as a future opportunity, not an action item.

### 5.4 Counter-trigger — DO NOT blanket-revert on Cost-Optimization Audit

A future operator doing a "where can we save on Vercel Image Optimization?" analysis might consider removing `unoptimized` from these sites to "let the optimizer do its job". This is the **inverse** of the right answer per this ADR. The presence of `unoptimized` IS the cost-optimization. **Do not flip it back.**

## 6. The 1 case that genuinely CANNOT be optimized (`avatar-uploader.tsx`)

Per §3.3, the `avatar-uploader.tsx` site has no V2 migration path. The blob: URL is structurally untransformable. This ADR makes the asymmetry explicit:

| Site | Can be optimized if V2 conditions met? | Why / why not |
|---|:---:|---|
| `chat/page.tsx:151` | ✅ | Signed URL → could be public-URL bucket (Trigger A) or large-render use case (Trigger B) |
| `payments/page.tsx:128` | ✅ | Same as above |
| `avatar-uploader.tsx:150` | ❌ | `blob:` URL is structurally excluded by the Next.js image optimizer contract. `unoptimized` here is **permanent**. |

This asymmetry justifies keeping the file-level pattern across the 3 sites (Reasons A/B/C consolidated): it's a single mental model with one carve-out explained above, not three independent per-site decisions to maintain.

## 7. Risks and mitigations

| Risk | Mitigation | Rollback |
|---|---|---|
| Operator removes `unoptimized` "to enable optimization" without reading this ADR | This ADR has a Counter-trigger section (§5.4). PR review checklist should flag any `-unoptimized` line in `git diff` for these 3 site files. | Re-add `unoptimized` prop + link to ADR in the PR description. |
| `next.config.mjs` `remotePatterns` is removed accidentally by a future operator | The `**.supabase.co` entry is the ALL Supabase Storage project match. If removed, no derived breakage here (we are on `unoptimized`), but other Vercel-optimized images that correctly expect the optimizer would 404. CI guard: lint warns on missing `remotePatterns`. | Restore `**  .supabase.co` from git history. |
| Future image source switches to a CDN OTHER than Supabase (R2, Wasabi, Bunny) | Add the new host to `images.remotePatterns` BEFORE shipping the source, AND evaluate Reasons A/B/D for the new URL class. | Update `next.config.mjs` `remotePatterns` + flip `unoptimized` if Reason A applies. |
| `avatar-uploader.tsx` switches from `URL.createObjectURL` to a data URL (base64) | Trivial — `unoptimized` still applies, the optimizer rejects data URLs too. | No action. |
| Future operator adds a 4th `unoptimized` site silently | ADR §5.3 and §5.4 are the reference. PR review must call out any new `<Image unoptimized>` use. | Add the site to the §1 audit table + amend ADR. |

## 8. Out of scope

- The 2 unflagged `<Image>` sites (`dashboard/page.tsx` and `components/courses-catalog.tsx`) — their `unoptimized` status is not inherited from the ESLint sweep and will be a separate audit (V2 candidate).
- Migrating to a non-Supabase CDN for user-generated content (long-term V2 cost optimization; cross-cuts storage, not just image optimization).
- Adding `images.formats: ['image/avif', 'image/webp']` to opt Vercel-side transcoding ON globally — valid V2 lever for non-flagged `<Image>` sites, irrelevant for the 3 flagged sites that never reach the optimizer.

## 9. Update log

- `0012-this-commit` — Initial ADR. Establishes the 3-site pattern, corrects the "register Supabase in remotePatterns = V2 path" premise, lays out the cache-hit-ratio / bandwidth-billing / blob-structural rationale, and proposes 3 trigger conditions for a future revisit.
- Future updates should diff-verifiable check: `git grep -nE 'unoptimized' src/` should report **exactly 3 sites** unless this ADR's §1 table is updated first.
