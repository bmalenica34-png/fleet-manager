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

## Radni proces — verifikacija, izvještavanje, ovisnosti, poznate zamke

Ustaljene konvencije ove sesije-po-sesije suradnje s korisnikom. Ne gube se
iako se context window resetira — ovaj fajl se čita na početku SVAKE sesije.

**1) Verifikacija**
- Ne postoji staging baza. Sve schema promjene idu s `prisma migrate deploy`
  IZRAVNO na produkcijsku bazu (nema shadow-DB replaya jer migracije se
  pišu ručno, ne kroz `prisma migrate dev` — vidi PROGRESS.md za razlog).
  Zbog toga: **prije pokretanja `migrate deploy`, eksplicitno zatraži
  potvrdu korisnika** (kratko opiši što migracija dodaje/mijenja).
- Nakon svake netrivijalne promjene, napravi stvaran end-to-end test PROTIV
  PRODUKCIJSKE baze (ne dev/lokalne baze, osim ako je eksplicitno drugačije
  dogovoreno) — ili preko privremene debug API rute, ili preko scratch
  `.ts`/`.mjs` skripte pokrenute s `npx tsx` iz `packages/api` (`cp .env`
  tamo prije, `rm .env` poslije — vidi memoriju `project_dev_server_gotchas`
  za točan recept). Nakon testa: **ukloni debug rutu/skriptu, obriši test
  podatke koje si kreirao, i potvrdi `git status` da nema ostataka.**
- Prije nego se zadatak smatra gotovim: `tsc --noEmit` na sva tri paketa
  (`@rent-a-car/api`, `@rent-a-car/web`, `@rent-a-car/mobile`) MORA proći
  čisto, i `next build` (apps/web) MORA proći bez grešaka.

**2) Izvještavanje na kraju svakog zadatka**
- Uvijek eksplicitno navesti je li commitano i pushano ili ne — nikad
  preskočiti tu rečenicu. Ako nije commitano: jasno reci "ništa nije
  commitano, javi ako želiš da commitam i pusham".
- Navesti točno što je testirano i kako — koja baza (dev ili produkcija),
  koliko test scenarija, što je prošlo/palo. "Radi" bez konkretnog dokaza
  nije dovoljno.

**3) Ovisnosti**
- Ne dodavati nove npm/expo pakete bez eksplicitnog pitanja korisnika
  PRIJE toga. Ako nedostaje neka mogućnost (npr. chart biblioteka), prvo
  pokušati riješiti bez nove ovisnosti (npr. ručno SVG/View-based rješenje
  — vidi `StatsChart.tsx` kao presedan), pitati tek ako stvarno nema
  drugog razumnog načina.

**4) Mobile paritet**
- Svaka nova web mogućnost MORA imati odgovarajuću mobile implementaciju u
  ISTOM zadatku, ne naknadno — osim ako korisnik eksplicitno kaže
  drugačije. Isti API pozivi iz `packages/api` (`apiFetch`/`uploadPickedFile`
  u `apps/mobile/src/lib/api.ts`), native UI ekvivalent (ne WebView).

**5) Poznate zamke**
- Next.js folderi koji počinju s `_` (npr. `api/_debug/...`) su privatni i
  ISKLJUČENI iz routinga — silently 404, bez build warninga. Nikad koristiti
  za privremene debug rute (koristi npr. `api/debug-<feature>` bez donje crte).
- `.next` cache se korumpira ako dev server i `next build` rade nad istim
  direktorijem istovremeno (i preko `preview_start`, ne samo terminalskog
  `next dev`). Prije svakog builda: zaustavi dev server (uklj.
  `preview_stop`), `rm -rf apps/web/.next`, tek onda gradi/pokreni ponovno.
- Lokalni Windows stroj je u `Europe/Zagreb` vremenskoj zoni (DST), dok
  produkcija (Vercel) radi u `TZ=UTC`. Datumska aritmetika bazirana na
  `setHours(0,0,0,0)` + fiksni `86400000` ms/dan (cron.ts,
  registrationReminders.ts, vehicleStats.ts, vehicleCosts.ts,
  statsTimeSeries.ts, periodicReports.ts) daje pogrešne rezultate LOKALNO
  kad testni raspon prelazi DST granicu (kraj ožujka/listopada) — nije
  produkcijski bug. Ako se sumnja na timezone bug: testiraj s privremenim
  `TZ=UTC` u `apps/web/.env` (makni nakon testa), ili biraj test-raspone
  koji ne prelaze DST granicu.
- `packages/api` nema trajni `.env` (namjerno obrisan nakon inicijalnog
  setupa) — Prisma CLI i scratch skripte pokrenute iz tog direktorija
  trebaju `cp ../../.env .env` prije, `rm .env` poslije.

## Redoslijed rada

1. Prisma shema + monorepo setup
2. Owner-web: CRUD vozila + kreiranje ugovora
3. Public signing flow (token-based, bez auta)
4. PDF generacija + storage integracija
5. Cron za istek + anex flow
6. Auth sloj + client-web (poveži postojeće ugovore po emailu)
7. Mobile appovi (owner-mobile, client-mobile) — reuse logike iz packages/api
8. Photo request flow
