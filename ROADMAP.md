> ⚠️ **DEPRECATED — usa [docs/roadmap-current.md](docs/roadmap-current.md) invece.**
>
> Questo file è conservato per git history ma non riflette più lo stato del progetto. Le info su **V1 blockers**, **Post-V1** (V1.1, V2), **Tech debt** e **Esplicitamente fuori scope** vivono nel file canonico a `docs/roadmap-current.md`. Per la specifica MVP legacy vedi anche `docs/archive/MVP-SPEC-initial.md`.

# Roadmap di Sviluppo

## Fase 1 — MVP (Settimane 1-4)

**Obiettivo**: Primo prodotto vendibile, checkout funzionante, 3 lingue.

### Settimana 1-2: Fondamenta
- [ ] Setup Next.js + TypeScript + Tailwind
- [ ] Database schema (Prisma + PostgreSQL)
- [ ] Sistema i18n base (3 lingue: IT, EN, ES)
- [ ] Autenticazione (Google OAuth via Supabase)
- [ ] Layout base responsive

### Settimana 3: Prodotti & Contenuti
- [ ] Schema prodotti con campi localizzati
- [ ] Admin panel base (CRUD prodotti)
- [ ] Pagina prodotto pubblica (i18n)
- [ ] Player video embedded (YouTube/Vimeo)

### Settimana 4: Checkout & Delivery
- [ ] Integrazione Stripe Checkout
- [ ] Webhook pagamento → concessione accesso
- [ ] Area utente: lista acquisti + download PDF
- [ ] Email transazionali (benvenuto, conferma ordine)

### Deliverable MVP
- Sito pubblico in 3 lingue
- 1 prodotto in vendita con checkout Stripe
- Accesso automatico dopo pagamento
- Dashboard utente base

---

## Fase 2 — Validazione (Settimane 5-8)

**Obiettivo**: Testare il modello, raccogliere dati, ottimizzare conversioni.

### Features
- [ ] Tracking sorgente (UTM da YouTube)
- [ ] Analytics base (conversioni per lingua, canale)
- [ ] 2-3 prodotti in vendita
- [ ] PDF downloadabili per lingua
- [ ] Pagina landing per ogni prodotto
- [ ] A/B testing su prezzo e CTA

### Metriche da monitorare
- Tasso di conversione per lingua
- Revenue per canale YouTube
- Tasso di abbandono checkout
- Download PDF vs visualizzazioni video

---

## Fase 3 — Crescita (Settimane 9-16)

**Obiettivo**: Scalare a 10+ prodotti, 5+ lingue, automazioni.

### Features
- [ ] Aggiunta nuove lingue (FR, DE, PT, JA, KO)
- [ ] Tracce audio multiple per lezione
- [ ] Player audio integrato nella lezione
- [ ] Sistema di affiliazioni (partner che promuovono)
- [ ] Email marketing automation (abbandono carrello, upsell)
- [ ] Dashboard admin avanzata (revenue, utenti, cohort)
- [ ] Coupon e sconti dinamici
- [ ] Bundle di prodotti

### Infrastruttura
- [ ] CDN per file statici (Cloudflare)
- [ ] Cache per pagine pubbliche
- [ ] Monitoring e alert (Sentry, Uptime Robot)
- [ ] Backup automatici database

---

## Fase 4 — Espansione (Mese 5+)

**Obiettivo**: Piattaforma completa, multi-prodotto, multi-lingua.

### Features
- [ ] Player video custom (non dipendere da YouTube)
- [ ] Sottotitoli generati automaticamente (Whisper API)
- [ ] Traduzione automatica contenuti (LLM)
- [ ] Abbonamenti e accesso ricorrente
- [ ] Community / forum per studenti
- [ ] Certificati di completamento
- [ ] API pubblica per integrazioni
- [ ] Mobile app (React Native o PWA)

### Business
- [ ] Marketplace dove altri creator vendono
- [ ] Programma ambassador
- [ ] Integrazione con sistemi LMS (SCORM)
- [ ] Enterprise plan per aziende

---

## Milestone Chiave

| Milestone | Target | Metrica |
|---|---|---|
| Primo vendita | Settimana 4 | 1 transazione completata |
| €1.000 MRR | Mese 2 | Revenue ricorrente mensile |
| 100 clienti | Mese 3 | Utenti con almeno 1 acquisto |
| 5 lingue attive | Mese 4 | Contenuti disponibili in 5 lingue |
| €10.000 MRR | Mese 6 | Revenue ricorrente mensile |
| 1.000 clienti | Mese 8 | Utenti attivi totali |
