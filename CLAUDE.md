# Rent-a-Car Manager — Project Instructions

## Što gradimo

Monorepo aplikacija za upravljanje rent-a-car flotom, sa dva odvojena app-a na
zajedničkom backendu:

- **Owner app** (web + mobile) — vlasnik/najmodavac upravlja flotom, ugovorima,
  zahtjevima za potpis i slikanjem vozila
- **Client app** (web + mobile) — najmoprimac vidi svoje ugovore, potpisuje,
  traži produženje, odgovara na zahtjeve za slikanje

**v1 scope:** BEZ self-service/automatskog bookinga. Owner uvijek ručno kreira
i šalje zahtjev za ugovor. Client app služi za pregled/potpis/produženje, ne za
samostalnu rezervaciju vozila.

## Stack

- **Web:** Next.js 14 (App Router), TypeScript
- **Mobile:** Expo (React Native), TypeScript — dijeli logiku s webom kroz
  `packages/api`
- **DB:** PostgreSQL (Supabase) + Prisma ORM
- **Storage:** Hetzner Object Storage (S3-compatible) — slike vozila, prometna,
  vozačke/osobne, PDF ugovori i zapisnici
- **Auth:** Supabase Auth — magic link i/ili SMS OTP, odvojene role Owner/Client
- **Email:** Resend — signing linkovi, notifikacije o isteku, zahtjevi za slike
- **PDF:** `@react-pdf/renderer` (ili puppeteer za kompleksniji layout) —
  generira ugovor + primopredajni zapisnik s uključenim slikama
- **E-potpis:** `react-signature-canvas` (canvas potpis, obični e-potpis,
  dovoljno za rent-a-car ugovore u RH)
- **Cron:** Vercel Cron — dnevna provjera isteka ugovora

## Struktura monorepoa (Turborepo)

```
apps/
  owner-web
  owner-mobile
  client-web
  client-mobile
packages/
  api      (Prisma client, Zod scheme, shared server logika)
  ui       (shared komponente, ako dizajn sustav ima smisla dijeliti)
```

## Data model (Prisma, skica)

- `Vehicle` — marka, model, tablice, prometna (file url), slike[]
- `Client` — ime, OIB, vozačka (slika), osobna (slika), telefon, email, userId
  (nullable — poveže se s auth accountom kad se klijent registrira/potvrdi)
- `Contract` — vehicleId, clientId, dateFrom, dateTo, status
  (draft/sent/signed/expired), signingToken (JWT, kratkotrajan, jednokratan),
  contractPdfUrl, protocolPdfUrl
- `HandoverPhoto` — contractId, kutSnimanja (enum: front/back/left/right/
  interior...), url, opisOštećenja
- `Annex` — parentContractId, noviDateTo, signedAt, status
- `PhotoRequest` — contractId, requestedAt, fulfilledAt, photos[]

## Ključni flow-ovi

**Kreiranje i potpis ugovora**
1. Owner bira vozilo + datume → sustav generira `signingToken` (48h expiry) →
   mail klijentu s linkom
2. Ako je klijent već registriran (userId postoji) → i in-app notifikacija u
   client appu; ako nije → isključivo token-link iz maila
3. Public/in-app signing stranica: upload vozačke i osobne, potvrda telefona
   (email već poznat), wizard za slikanje vozila po fiksnim kutovima (min.
   prednja/stražnja/lijeva/desna strana) s opisom oštećenja po slici, canvas
   potpis
4. Backend generira ugovor + primopredajni zapisnik kao PDF (sa svim
   slikama/opisima), sprema na Hetzner, mailom šalje objema stranama, status
   → `signed`

**Istek i produženje**
- Cron dnevno provjerava ugovore kojima `dateTo` ističe za 3 dana → mail (+
  in-app ako je registriran) s linkom/CTA za produženje
- Produženje kreira `Annex` — lakši signing flow, bez re-uploada dokumenata

**Periodično slikanje**
- Owner ručno okine "zatraži slike" bilo kad tijekom aktivnog najma →
  `PhotoRequest` → mail/in-app notifikacija klijentu → isti upload widget kao
  kod primopredaje

## Konvencije

- Sve server-side validacije kroz Zod scheme u `packages/api`, dijele se
  između weba i mobilea
- Nikad ne vraćati raw file pathove s Hetznera na frontend — uvijek kroz
  presigned URL s kratkim expiryjem
- Signing token se invalidira odmah nakon uspješnog potpisa (jednokratan)
- Client bez accounta i dalje mora moći kompletirati cijeli signing flow
  preko token-linka — auth nije uvjet za potpis, samo za pregled povijesti

## Redoslijed rada

1. Prisma shema + monorepo setup
2. Owner-web: CRUD vozila + kreiranje ugovora
3. Public signing flow (token-based, bez auta)
4. PDF generacija + storage integracija
5. Cron za istek + anex flow
6. Auth sloj + client-web (poveži postojeće ugovore po emailu)
7. Mobile appovi (owner-mobile, client-mobile) — reuse logike iz packages/api
8. Photo request flow
