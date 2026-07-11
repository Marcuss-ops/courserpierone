# `_archive/`

Dead code kept ONLY for git history / archaeology. **Do not re-import,
re-export, or re-activate files in this folder.**

If you find yourself about to import from here, the right move is to
re-evaluate whether the original problem still exists, and if so write
the replacement fresh — do not resurrect an archived file as-is,
because by definition it was retired for a reason.

## Items

- `legacy-root-middleware.ts` — superseded by `src/middleware.ts`.
  Retired to stop Next.js from picking up **two concurrent middleware
  files** (this one at root was setting `x-locale-reason: ip` debug
  headers and was the cause of stale Vercel edge behaviour).
  Retired on `chore(middleware): drop legacy root middleware.ts`.
