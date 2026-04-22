# Z-Domicile — SEO Agent Context

This file is the single source of truth for any AI agent managing SEO for Z-Domicile. Read it entirely before taking any action.

---

## 1. What is Z-Domicile?

**Z-Domicile** (https://www.z-domicile.fr) is a French SaaS marketplace for booking at-home professionals — think Doctolib, but for beauty and wellness services delivered at the client's home.

**Business model:** Two-sided marketplace

- **Supply side (B2B):** Independent professionals (hairdressers, beauticians, sports coaches, etc.) pay a commission only on bookings originating from Z-Domicile's platform. Bookings from their own direct links = 0% commission.
- **Demand side (B2C):** Individuals looking to book a professional to come to their home.

**Go-to-market split:**

- B2C traffic → acquired through **SEO** (this agent's job)
- B2B professional acquisition → acquired through **cold calling** (separate workflow, outside this agent's scope)

---

## 2. Tech Stack

| Layer | Technology |
| :---- | :---- |
| Frontend | Angular 17 (SSR enabled for SEO-critical pages) |
| Backend API | Express.js (Node) |
| Core backend | Spring Boot (Java) |
| Domain | https://www.z-domicile.fr |

**SEO-relevant architectural notes:**

- SSR (Server-Side Rendering) is enabled for landing pages and local pages — these are prerendered for Googlebot
- Dynamic routes (`/fiche-resa/:uID/:actID` — professional profiles) previously relied on client-side rendering (CSR); this has been partially fixed
- The SeoService handles canonical URLs, structured data (Schema.org), and meta tags dynamically
- Sitemap is at https://www.z-domicile.fr/sitemap.xml

---

## 3. SEO Strategy

### Core positioning

Z-Domicile positions itself to Google as a **local annuaire/marketplace** (like Pages Jaunes or WeCasa), not as a SaaS tool. This is deliberate — it unlocks high-volume B2C keywords.

### Target persona

**French individuals** searching for a beauty/wellness professional to come to their home, in Paris, Lyon, or Bordeaux (Phase 1-2), then other major French cities (Phase 3).

### URL architecture

```
/[métier]-[a|domicile]-[ville]
```

Examples:

- `/coiffeuse-domicile-paris`
- `/estheticienne-a-domicile-paris`
- `/coach-sportif-a-domicile-paris`

### Geographic priority

1. Paris (primary — highest search volume)
2. Lyon
3. Bordeaux
4. Scale: Toulouse, Nantes, Lille, Nice, Strasbourg, Rennes, Montpellier (Phase 3)

---

## 4. Target Keywords

### Priority cluster — Strong local intent

| Keyword | Monthly Volume | Competition | Target URL |
| :---- | :---- | :---- | :---- |
| coiffeur à domicile paris | 10K–100K | Low | `/coiffeuse-domicile-paris` |
| coiffeur à domicile lyon | 1K–10K | Low | `/coiffeur-a-domicile-lyon` |
| coiffeur à domicile bordeaux | 1K–10K | Low | `/coiffeur-a-domicile-bordeaux` |
| esthéticienne à domicile paris | 1K–10K | Low | `/estheticienne-a-domicile-paris` |
| esthéticienne à domicile lyon | 100–1K | Low | `/estheticienne-a-domicile-lyon` |
| coach sportif à domicile paris | 1K–10K | Low | `/coach-sportif-a-domicile-paris` |
| massage à domicile paris | 1K–10K | Low | `/massage-a-domicile-paris` |
| manucure à domicile paris | ~1K | Low | `/manucure-domicile-paris` |
| maquilleuse à domicile paris | ~1K | Low | `/maquilleuse-domicile-paris` |

### Secondary cluster — Informational/transactional B2C

| Keyword | Volume | Content type |
| :---- | :---- | :---- |
| coiffeuse à domicile tarif | 1K–10K | Blog article |
| esthéticienne à domicile pas cher | 100–1K | Blog article |
| coiffeur à domicile pas cher paris | 100–1K | Local page |
| massage à domicile pas cher | 100–1K | Blog article |

### Out of scope (B2B — handled by cold call, NOT SEO)

- plateforme coiffeur
- logiciel coiffeur à domicile
- auto entrepreneur coiffure
- comment devenir coiffeur / esthéticienne / kiné

---

## 5. Local Page Template Structure

Every local page (`/[métier]-a-domicile-[ville]`) must follow this structure:

| Section | Content |
| :---- | :---- |
| H1 | "[Métier] à [Ville] — Réservez en ligne" |
| Sous-titre | "Des [professionnels] disponibles dans votre arrondissement, réservation instantanée" |
| How it works | 3 steps for the client: Choisir → Réserver → Recevoir le pro |
| Pro listings | Profiles of available professionals (at least 2-3) |
| Indicative pricing | Price range to reassure the client |
| Local FAQ | "Combien coûte un [métier] à domicile à [ville] ?" |
| CTA | "Réserver un [métier] à domicile" |
| Neighborhoods | Reference specific arrondissements/quartiers for each city (see below) |

**City-specific neighborhoods to mention:**

- **Paris:** 75001–75020, focus on 11e, 15e, 18e
- **Lyon:** Presqu'île, Part-Dieu, Confluence, Villeurbanne
- **Bordeaux:** Chartrons, Saint-Michel, Mériadeck, Bacalan

**Writing rules:**

- Always write for the end client (B2C), never for the professional
- Avoid SaaS/B2B language (no "plateforme", "logiciel", "gérer vos RDV")
- Use natural, conversational French

---

## 6. Current SEO Status (as of April 2026)

### Pages live and indexed

| URL | Status |
| :---- | :---- |
| https://www.z-domicile.fr/ | ✅ Indexed (11/03/2026) |
| https://www.z-domicile.fr/search-pro | ✅ Indexed (21/03/2026) |
| https://www.z-domicile.fr/manucure-domicile-paris | ✅ Indexed (21/03/2026) |
| https://www.z-domicile.fr/contact | ✅ Indexed (21/03/2026) |
| https://www.z-domicile.fr/coiffeuse-domicile-paris | 🟢 Not yet indexed |
| https://www.z-domicile.fr/maquilleuse-domicile-paris | 🟢 Not yet indexed |
| https://www.z-domicile.fr/estheticienne-a-domicile-paris | 🟢 Not yet indexed (created 25/03/2026) |
| https://www.z-domicile.fr/coiffeur-a-domicile-lyon | ✅ Created (01/04/2026) |

---

## 7. Agent Operating Rules

When acting as the Z-Domicile SEO agent, follow these rules:

1. **B2C only** — all content must target end consumers, not professionals
2. **Local intent** — every local page must feel geographically specific, not generic
3. **Annuaire framing** — position Z-Domicile like Pages Jaunes / WeCasa, not like a SaaS
4. **No fake data** — never add fictitious ratings, reviews, or prices to structured data
5. **Update `SEO_TRACKER.md`** after completing any action — change status from `🟢 À faire` to `✅ Fait`
6. **Check GSC data** before writing new content — use real impressions/positions to prioritize
7. **Structured data** — always use `@graph` pattern to avoid schema overwriting
8. **Canonical URLs** — every page must call `updateCanonicalUrl()` with its own URL
9. **Internal linking** — new pages must be linked from the homepage and related pages
10. **Image requirements** — OG images must be 1200×630px, stored in `/assets/images/`
