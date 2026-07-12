# `auth/` — NextAuth Configuration

> Autenticazione: Google OAuth + Supabase Auth sessions.

_(Legacy: questo README descrive la vecchia config NextAuth. La migration a Supabase Auth è il riferimento attuale.)_

## File

| File | Descrizione |
|---|---|
| `auth.ts` | Configurazione completa NextAuth (providers, callbacks, pages, session) |

## Esport

```ts
import { authOptions } from "@/lib/auth/auth";
```

## Providers

- **Email** — (rimosso, vedi Supabase Auth)
- **Google OAuth** — (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- **Session** — JWT strategy (no DB session table)

## Callbacks

| Callback | Ruolo |
|---|---|
| `jwt` | Scrive `role` nel token |
| `session` | Espone `id` e `role` nella sessione client |

## Variabili d'ambiente richieste

```env
NEXTAUTH_SECRET=        # openssl rand -base64 32
NEXTAUTH_URL=           # https://www.courssy.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=noreply@courser.app
```

## Schema Prisma correlato

```prisma
model User { id, name, email, image, role, orders }
# NB: I modelli NextAuth (Account, Session, VerificationToken) sono
# stati rimossi con la migration `20260712220000_drop_nextauth_models`
# (post Supabase migration). Auth è 100% Supabase Auth.
```