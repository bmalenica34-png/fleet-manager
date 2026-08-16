# Rent-a-Car Manager — Progress Log

Dinamički log stanja projekta. Ažurira se na kraju svake sesije. Za statičnu
arhitekturu/konvencije vidi [CLAUDE.md](CLAUDE.md) — ovaj dokument je "što je
gotovo i zašto", ne "kako treba izgledati".

**Zadnje ažurirano:** 2026-08-16, sesija koja je popravila Vercel deploy
(bug #20) i prebacila mobile na produkcijski backend (bug #21) — nastavak
sesije koja je pokrila modul 7 fazu 1 (mobile auth + skeleton) i module
1-6 + registracije/police osiguranja + modul 8.

---

## 1. Status po modulu

Redoslijed iz CLAUDE.md: 1 shema/monorepo → 2 owner CRUD → 3 signing flow →
4 PDF → 5 cron/anex → 6 auth/client-web → 7 mobile → 8 photo request.
Stvarni redoslijed rada u ovoj sesiji odstupio je na kraju: nakon modula 6
umetnut je ad-hoc zahtjev za **registracije/police osiguranja** (nije bio u
originalnom CLAUDE.md popisu, korisnik ga je zatražio usred sesije), pa je
**modul 8 rađen prije modula 7** (korisnikov izričit izbor — "brži je i ima
već logiku"). Modul 7 (mobile) je **jedino što ostaje**.

| # | Modul | Status |
|---|-------|--------|
| 1 | Prisma shema + monorepo setup | ✅ gotovo |
| 2 | Owner-web CRUD vozila + kreiranje ugovora | ✅ gotovo, testirano uživo |
| 3 | Public signing flow | ✅ gotovo, testirano uživo |
| 4 | PDF generacija + storage | ✅ gotovo, testirano uživo |
| 5 | Cron istek ugovora + anex flow | ✅ gotovo, testirano uživo |
| 6 | Auth sloj (Supabase) + client-web | ✅ gotovo, testirano uživo (uklj. pravi magic-link klik) |
| — | Registracija vozila + polica osiguranja (ad-hoc) | ✅ gotovo, testirano uživo |
| 8 | Photo request flow | ✅ gotovo, testirano uživo |
| 7 | Mobile appovi (owner-mobile, client-mobile) | 🔶 **Faza 1 (auth + skeleton) gotova, čeka live test na uređaju** |

Svaki modul označen "testirano uživo" je stvarno proveden kroz browser
(Claude Browser Pane) ili direktnim HTTP pozivima na dev server, ne samo
typecheck/build. Detalji ispod.

### Modul 1 — Prisma shema + monorepo
Turborepo, **pnpm** workspaces (ne npm — vidi bug #2 niže), `apps/web`
(Next.js 14.2.35, App Router, TS), `apps/mobile` (Expo SDK 57 scaffold,
**netaknut od tada** — samo initial `create-expo-app` output), `packages/api`.

`packages/api` ima **dva exporta**:
- `@rent-a-car/api` — samo Zod scheme + Prisma tipovi. Sigurno za bundlati
  bilo gdje (uklj. buduću mobile app).
- `@rent-a-car/api/server` — Prisma client + sva poslovna logika + storage +
  email + PDF. **Node-only, isključivo Next.js server kontekst.** Nikad ne
  importati iz mobile/client koda.

Prisma modeli: `Vehicle`, `VehicleImage`, `Client`, `Contract`,
`HandoverPhoto`, `Annex`, `PhotoRequest`, `Owner` (dodan u modulu 6).
Sva polja koja čuvaju putanju do fajla zovu se `*Key` (S3 key), ne `*Url` —
vidi arhitektonsku odluku niže.

### Modul 2 — Owner CRUD + kreiranje ugovora
`/vehicles`, `/vehicles/new`, `/vehicles/[id]`, `/clients`, `/contracts`,
`/contracts/new`. Upload prometne/slika kroz staged-preview obrazac (state
drži File objekt + `URL.createObjectURL` preview dok korisnik ne klikne
"Spremi" — vidi bug #4). Kreiranje ugovora generira 48h JWT signing token i
šalje mail klijentu.

### Modul 3 — Public signing flow
`/sign/[token]`. Jednoekranski wizard: upload vozačke/osobne + telefon →
4 obavezna kuta slikanja (front/back/left/right) + opis oštećenja po slici →
canvas potpis → jedan finalni submit koji sve šalje odjednom (ne upload po
koraku — izbjegava djelomično stanje u bazi). Vidi bugove #8, #9.

### Modul 4 — PDF + storage
`packages/api/src/pdf/` — `ContractPdf.tsx`, `ProtocolPdf.tsx`,
`AnnexPdf.tsx` (dodan u modulu 5), `components.tsx` (cast wrapper za
react-pdf komponente, vidi bug #10), `generate.tsx`, `styles.ts`,
`format.ts`. Generira se nakon potpisa, upload na Hetzner, mail objema
stranama s PDF prilozima. Best-effort — greška u PDF/mail koraku ne ruši
već spremljen potpis (try/catch, `console.error`). Vidi bugove #10, #11, #12.

### Modul 5 — Cron istek ugovora + anex
`/api/cron/check-expiring` (CRON_SECRET zaštićen), dnevno u 8h UTC
(`apps/web/vercel.json`). Nalazi ugovore kojima `dateTo` ističe točno za 3
dana (status `signed`, bez već postojećeg pending anexa), kreira `Annex` s
predloženim novim datumom (produženje za isto trajanje kao original), šalje
mail s linkom na `/extend/[token]` — lakši signing flow (samo datum + potpis,
bez re-uploada dokumenata). Potpisivanje anexa ažurira `Contract.dateTo`.

### Modul 6 — Auth + client-web
Supabase Auth, **magic link only** (vidi arhitektonsku odluku). Owner/Client
role razdvajanje preko DB tablica (`Owner` model + `Client.userId`), ne
Supabase custom claims. `/login` (owner, allowlist provjera prije slanja
linka), `/portal/login` (client, otvoreno svima). `/api/auth/callback`
zajednički handler — pokušava linkati i Owner i Client ulogu (oba no-op ako
se ne primjenjuju), pa preusmjerava na `/vehicles` ako je Owner, inače
`/portal`. Middleware (`src/middleware.ts`) radi grubu Edge-provjeru ("ima
li sesije uopće"); stvarna provjera uloge je u `layout.tsx` Server
Componentima (Node runtime, mogu upitati Prisma). Sve owner API rute
zaštićene `requireOwnerSession()` helperom (ne samo stranice — vidi
arhitektonsku odluku). Testirano pravim magic-link klikom, korisnik potvrdio
"testirano, radi". Vidi bugove #13, #14.

### Registracija vozila + polica osiguranja (ad-hoc, nije u originalnom planu)
`Vehicle.registrationExpiresAt`, `Vehicle.insurancePolicyKey` (isti obrazac
kao prometna). Cron `/api/cron/check-registrations`, dnevno u 8h UTC, 3
milestone-a (7/3/0 dana prije isteka), dedupe preko
`registrationReminder{7,3,0}SentAt` polja na Vehicle (da se ne pošalje
dvaput isti milestone). Šalje mail vlasniku i trenutnom aktivnom klijentu
vozila (ako postoji potpisan ugovor gdje je danas unutar `dateFrom`–`dateTo`).
Zajednički `isAuthorizedCronRequest` helper (`apps/web/src/lib/verifyCronSecret.ts`)
dijeli se s modulom 5 nakon što je dodan drugi cron endpoint.

### Modul 8 — Photo request flow
`PhotoRequest.requestToken` (isti JWT mehanizam kao Contract/Annex). Owner s
`/contracts` klikne "Zatraži slike" (gumb prikazan samo za aktivne potpisane
ugovore bez već poslanog nepodmirenog zahtjeva) → `/api/contracts/[id]/photo-requests`
kreira zahtjev, validira da je ugovor stvarno aktivan, šalje mail. Klijent
kroz `/request-photos/[token]` — isti angle-grid kao u primopredaji, ali
samostalan (bez dokumenata/potpisa). Upload sprema `HandoverPhoto` (vezan i
na `contractId` i na `photoRequestId`), označava `fulfilledAt`, invalidira
token, šalje potvrdu vlasniku.

### Modul 7 — Mobile appovi (Faza 1: auth + skeleton, gotovo — čeka live test)
Modul razbijen u faze (korisnikov izbor). Faza 1 = zajednički auth sloj +
navigacijski skeleton za owner i client ulogu, prije feature ekrana. Plan
sesije: `C:\Users\Brane\.claude\plans\merry-marinating-tulip.md`.

**Backend (apps/web)** — tri promjene, sve backward-compatible s postojećim
web flow-om (cookie-based web login nastavlja raditi identično):
- `requireOwnerSession(request)` generaliziran (bio je bez argumenata) — prvo
  provjeri `Authorization: Bearer <token>` header
  (`apps/web/src/lib/supabase/bearer.ts`, goli `@supabase/supabase-js`,
  `auth.getUser(token)`), fallback na postojeći cookie flow. Svih 8 owner API
  ruta ažurirano da proslijede `request`. Ovo odmah čini SVE owner rute
  pozivive s mobilea, bez potrebe za dupliciranjem u budućim fazama.
- Novi `POST /api/auth/mobile/resolve` — mobile analog web
  `/api/auth/callback`, ista `linkOwnerAccount`/`linkGuestClientsToUser`
  logika, ali preko Bearer tokena umjesto cookieja, vraća JSON
  `{ role, email }` umjesto redirecta.
- `redirectTo` override u `owner/request-link` i `client/request-link`
  rutama (`apps/web/src/lib/mobileRedirect.ts`) — mobile šalje
  `rentacarmanager://auth-callback`, validirano protiv `MOBILE_APP_SCHEME`
  env varijable (dodana u `.env`/`.env.example`) da se spriječi
  open-redirect. Web pozivi (bez `redirectTo` u body-ju) nepromijenjeni.

**Mobile (apps/mobile)** — Expo Router (file-based routing, zamijenio stari
`App.tsx`/`index.ts` — `package.json` `main` sad `expo-router/entry`).
Novi paketi: `expo-router`, `expo-linking`, `expo-constants`,
`react-native-safe-area-context`, `react-native-screens`,
`expo-auth-session`, `@supabase/supabase-js`,
`@react-native-async-storage/async-storage`, `react-native-url-polyfill`.
`app.json` dobio `"scheme": "rentacarmanager"`.

Struktura: `src/lib/supabase.ts` (RN klijent, AsyncStorage storage adapter,
`detectSessionInUrl: false` jer se deep link hvata ručno),
`src/lib/api.ts` (fetch wrapper, Bearer header iz trenutne Supabase sesije),
`src/lib/auth-context.tsx` (React context, `status: "loading" | "signed-out"
| "owner" | "client"`, poziva `/api/auth/mobile/resolve` na svaku promjenu
sesije). Ekrani: `app/login.tsx` (toggle Vlasnik/Klijent + email),
`app/check-email.tsx`, `app/auth-callback.tsx` (parsira
`access_token`/`refresh_token` iz deep-link URL-a preko `expo-linking` +
`expo-auth-session`-ovog `QueryParams` helpera, `setSession()`),
`app/index.tsx` (redirect prema statusu), `app/owner/home.tsx` (smoke-test:
poziva `GET /api/vehicles`, prikazuje broj vozila), `app/client/home.tsx`
(placeholder). **Napomena: `owner/` i `client/` su pravi path segmenti, NE
Expo Router route grupe** — `(owner)/home` i `(client)/home` bi kolidirali
na istom URL-u `/home` jer parentheses folderi ne dodaju segment u putanju.

`apps/mobile/.env` (gitignored, isti obrazac kao `apps/web/.env`):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_API_BASE_URL` — **od bug #21 (vidi sekciju 2) pokazuje na
produkcijski Vercel backend
(`https://fleet-manager-web-branimir-s-projects1.vercel.app`), ne na LAN
IP dev servera.** Telefon više ne mora biti na istoj WiFi mreži kao
računalo za testiranje mobilea.

**Verifikacija napravljena bez uređaja** (Claude Browser Pane ne može
prikazati Expo app): `tsc --noEmit` čisto na `apps/web` i `apps/mobile`,
`npx expo export --platform ios` uspješno izbundlao svih 1164 modula (hvata
Metro/import greške koje tsc ne vidi), curl smoke-test na dev serveru
potvrdio `POST /api/auth/mobile/resolve` → 401 bez tokena, `GET
/api/vehicles` → 401 bez sesije, `POST /api/auth/owner/request-link` s
mobile `redirectTo` → `{"ok":true}` (stvarni magic-link mail je poslan na
`b.malenica34@gmail.com` kao dio ovog testa).

**Ostaje prije nego se faza 1 proglasi gotovom** (treba korisnika s
telefonom/simulatorom — vidi sekciju 5):
1. Ručno registrirati `rentacarmanager://**` redirect URL u Supabase
   dashboardu (Authentication → URL Configuration) — bez ovoga Supabase
   odbija magic-link redirect na custom scheme.
2. `pnpm --filter mobile start`, otvoriti u Expo Go, kliknuti pravi magic
   link, potvrditi da app landa na `owner/home` s ispravnim brojem vozila,
   da sesija preživi restart appa, i da logout radi.

---

## 2. Bugovi otkriveni i riješeni

Poredano kronološki. Označeni ⚠️ su oni za koje je korisnik eksplicitno
tražio da se zapamte jer bi se mogli ponoviti.

1. **`create-next-app@latest` je povukao Next.js 16 umjesto tražene v14**
   (React 19 umjesto 18). Fix: eksplicitno `create-next-app@14`.

2. ⚠️ **React 18 (web) vs React 19 (Expo mobile) sudar pod npm hoisting-om.**
   `npm install` u monorepou hoista OBA React-a u dijeljeni `node_modules`,
   web build je pucao s `Cannot read properties of null (reading 'useContext')`
   jer je styled-jsx (Next-ov interni dio) povlačio krivu verziju Reacta.
   **Fix: prebačeno s npm-a na pnpm** (izolirani `node_modules` po paketu,
   službena preporuka za Turborepo monorepoe upravo zbog ovoga). Ako se
   ikad razmišlja o vraćanju na npm — nemoj, ovo je razlog.

3. ⚠️ **`.next` cache konflikt kad `next build` i `next dev` dijele isti
   direktorij.** Pokretanje builda dok dev server radi korumpira `.next`,
   server puca s `Cannot find module './NNN.js'` (500). **Ovo se ponovilo
   VIŠE PUTA tijekom sesije** unatoč tome što je identificirano rano.
   **Pravilo za ubuduće: nakon SVAKOG `pnpm build`, prije restart dev
   servera, MORA se `rm -rf apps/web/.next`.** Spremljeno u memoriju
   (`project_dev_server_gotchas.md`).

4. **Bug prijavljen od korisnika: preview slika nestaje odmah nakon odabira,
   prije Spremi.** Uzrok: nije postojao nikakav staged-file state — file
   input je odmah na `onChange` slao upload, a `event.target.value = ""` se
   izvršavao bezuvjetno i na uspjeh i na neuspjeh, bez ikakve error poruke.
   Fix: pravi staged state (`File` + `URL.createObjectURL` preview),
   akumulacija kroz više odabira (append, ne overwrite), eksplicitan
   "Spremi" gumb, revoke object URL-ova pri zamjeni/unmountu preko ref-a.

5. **`HETZNER_S3_ENDPOINT` bez `https://` prefiksa** → AWS SDK `new URL()`
   baca "Invalid URL". Fix: dodan prefiks u `.env`.

6. ⚠️ **`apps/web` čita `.env` iz vlastitog direktorija, ne iz root-a
   monorepoa** (Next.js dev server cwd = `apps/web`). Root `.env` promjene
   se NE pokupe automatski. **Fix/radni obrazac: root `.env` je izvor
   istine, kopira se u `apps/web/.env` nakon svake promjene** (oba
   gitignored). Zaboraviti ovo = satima debugirati "zašto env varijabla ne
   radi" kad zapravo radi, samo na krivom mjestu.

7. ⚠️ **`packages/api` nema trajni `.env`.** Izbrisan nakon initial setupa
   jer ga Next.js runtime ne čita (samo `apps/web/.env`). Ali Prisma CLI
   (`migrate`, `generate`) i ad-hoc Node scratch skripte pokrenute IZ
   `packages/api` trebaju vlastiti `.env`. **Radni obrazac: `cp ../../.env
   .env` prije komande, `rm .env` odmah nakon.** Ne ostavljati ga trajno
   (drifta iz sync-a s pravim). Spremljeno u memoriju.

8. **Potpis se gubio pri submitu u `/sign/[token]` wizardu.**
   `<SignatureCanvas>` se unmounta kad wizard prijeđe s koraka "signature"
   na "review" (uvjetni render), pa je `sigCanvasRef.current` bio `null` u
   trenutku submita → lažna "Potpis je obavezan" greška iako je potpis
   nacrtan. Fix: data URL potpisa se hvata ODMAH pri odlasku s koraka
   potpisa (dok ref još postoji), sprema se u state, review/submit koriste
   taj snapshot umjesto ref-a.

9. **`getTrimmedCanvas()` iz `react-signature-canvas` baca `TypeError: f is
   not a function`** — poznat problem s internom `trim-canvas` ovisnošću u
   ovom bundling okruženju. Fix: `getCanvas().toDataURL()` umjesto toga (vidi
   ograničenje #2 niže — bez auto-cropanja).

10. **`@react-pdf/renderer` + `@types/react` 18.3+ sukob tipova** (TS2786,
    "Property 'refs' is missing"). Pinanje `@types/react` na `18.2.79` NIJE
    dovoljno samo po sebi. Pravi fix: centralizirani cast u
    `packages/api/src/pdf/components.tsx` —
    `as unknown as FC<PropsWithChildren<...>>` oko Document/Page/Text/View/Image,
    reeksportirano odatle umjesto direktno iz `@react-pdf/renderer` u
    template-ima.

11. ⚠️ **`@react-pdf/renderer` je pucao u runtimeu** (`TypeError: a.Component
    is not a constructor`) jer ga Next.js App Router bundla kroz svoj RSC
    (React Server Components) webpack sloj, gdje "react" resolva na
    ograničenu server-only verziju bez punog `Component`. Radi u API
    routeu, ne u pageu — ali route handleri u App Routeru i dalje prolaze
    kroz taj isti bundling sloj. **Fix: `next.config.mjs` →
    `experimental.serverComponentsExternalPackages: ["@react-pdf/renderer",
    "@react-pdf/reconciler"]`** — tjera Next da ga učita kao pravi Node
    `require()`, mimo webpacka. Ako se ikad doda još neka Node-only
    biblioteka koja se čudno ponaša u API routeu, ovo je prvo mjesto za
    provjeru.

12. **Hrvatsko slovo "đ" nedostaje u react-pdf-ovom ugrađenom fontu**
    ("potvrđujem" → "potvr ujem" s prazninom). Fix samo u statičkom tekstu
    (preformulirano). Vidi ograničenje #1 niže — dinamički tekst (imena,
    opisi oštećenja) i dalje pogođen.

13. ⚠️ **`NEXT_PUBLIC_SUPABASE_URL` je imao krivi `/rest/v1/` sufiks** — taj
    sufiks je specifičan za PostgREST (DB upiti), NE za Auth API. Sa
    sufiksom, Supabase Auth pozivi (magic link, admin.generateLink, itd.)
    gađaju krivi URL (404 "Invalid path"). Fix: `NEXT_PUBLIC_SUPABASE_URL`
    mora biti goli project URL, `https://<ref>.supabase.co`, bez ikakvog
    sufiksa — SDK sam dodaje `/auth/v1/`, `/rest/v1/`, itd. po potrebi.

14. ⚠️ **PKCE vs implicit flow neusklađenost.** Rute za slanje magic linka
    (`/api/auth/owner/request-link`, `/api/auth/client/request-link`) su
    koristile obični `@supabase/supabase-js` `createClient` (default
    `flowType: 'implicit'`), dok `/api/auth/callback` koristi
    `exchangeCodeForSession` (očekuje PKCE + `code_verifier` cookie). Fix:
    OBJE request-link rute sad koriste SSR-svjesni klijent
    (`@/lib/supabase/server`, iz `@supabase/ssr`), koji defaulta na PKCE i
    ispravno postavlja `code_verifier` cookie. **Pravilo: bilo koji kod koji
    zove `supabase.auth.signInWithOtp` (ili bilo koju auth metodu koja vodi
    do callbacka s `exchangeCodeForSession`) MORA koristiti klijent iz
    `@supabase/ssr`, nikad goli `@supabase/supabase-js` createClient.**

15. **Napomena o Supabase pooler connection stringu.** Supabase-ov pooler
    (Supavisor/PgBouncer, port 6543) zahtijeva username u formatu
    `postgres.<project-ref>` (ne goli `postgres`) — to je specifično za
    pooled konekcije, direktna konekcija (port 5432) može koristiti goli
    `postgres`. `DATABASE_URL` i `DIRECT_URL` u `.env` su trenutno oba u
    `postgres.<ref>` formatu preko poolera i rade ispravno — ako se ikad
    mijenja connection string ručno, paziti na ovaj format, kriv username
    format daje auth grešku koja izgleda kao krivi password.

16. **`prisma migrate dev` ne radi neinteraktivno** kad dodaje novi unique
    constraint (traži potvrdu, ne prima je preko pipe-a čak ni s `yes |`).
    Radni obrazac kad se ovo desi: ručno napisati migration SQL u
    `prisma/migrations/<timestamp>_<naziv>/migration.sql` (isti format kao
    Prisma generira), pa `prisma migrate deploy` (neinteraktivno, misljeno
    za CI, primjenjuje pending migracije bez pitanja). Korišteno dvaput
    (Owner model, PhotoRequest token polja).

17. ⚠️ **PowerShell alat u ovoj okolini ne radi uopće** (svaka komanda vraća
    exit code 1 bez outputa, čak i `Write-Output "hello"`). **Bash alat radi,
    ali mu default PATH ne uključuje `pnpm`** (`pnpm` živi u
    `C:\Users\Brane\AppData\Roaming\npm\`, node/npm rade jer su u
    `/c/Program Files/nodejs`). Radni obrazac: u Bash pozivima koji trebaju
    pnpm, prefiksirati s `export PATH="/c/Users/Brane/AppData/Roaming/npm:$PATH" &&`.
    `.claude/launch.json` konfiguracije (preview_start) rade normalno jer
    imaju eksplicitan `runtimeExecutable` put do `pnpm.cmd`, ovo pogađa samo
    direktne Bash pozive (npr. `npx expo install`, `tsc --noEmit`).

18. ⚠️ **Windows MAX_PATH (260 znakova) ruši native Android build
    (`gradlew app:assembleDebug` / `expo run:android`) za RN module s C++
    kodom** (`react-native-worklets`, `react-native-reanimated` - potonji
    tranzitivna ovisnost preko `expo-router`, nije u `package.json`).
    Stvarna greška je zakopana iznad "BUILD FAILED" linije: CMake warninzi
    "the maximum full path to an object file is 250 characters
    (CMAKE_OBJECT_PATH_MAX)" pa `ninja: error: manifest 'build.ninja' still
    dirty after 100 tries" - Gradle-ov defaultni terminal output to ne
    pokazuje, treba `--stacktrace` i skrolati do stvarnog uzroka.
    Root cause: pnpm-ov virtual store folder ima peer-dependency hash
    sufiks (`react-native-reanimated@4.5_<32-char hash>/` - ~60 znakova sam
    po sebi, ne postoji config koji ga skrati), pa kombinacija dugog puta
    projekta (`C:\Users\Brane\Desktop\RENT-A-CAR app\`) + tog sufiksa +
    library-ovog vlastitog dubokog C++ stabla (npr. reanimated-ov
    `Common/NativeView/react/renderer/components/rnreanimated/
    REASharedTransitionBoundaryShadowNode.cpp.o`) probije limit.
    **Djelomični fix (primijenjen, u `.npmrc`):** `virtual-store-dir=C:/pnpm-vs`
    (MORA se proslijediti i kao `--virtual-store-dir` CLI flag pri `pnpm
    install` - sam `.npmrc` unos nije dovoljan da se primijeni u ovom pnpm-u,
    v11.21.0) - skraćuje prefiks dovoljno da `react-native-worklets` prođe,
    ali NE dovoljno za `react-native-reanimated`-ov dublji stablo. Probano i
    odbačeno: `public-hoist-pattern` za `react-native-*` - samo dodaje
    redundantan symlink u root `node_modules`, CMake/Gradle i dalje
    resolve-aju kroz njega do ISTE stvarne (hash-sufiksirane) lokacije, ne
    pomaže. `node-linker=hoisted` bi vjerojatno riješio (npm-style flat
    node_modules, bez hash sufiksa uopće) ali NIJE probano - to je točno
    postavka koja je uzrokovala bug #2 (React 18 web vs React 19 mobile
    sudar), previsok rizik da se vrati taj problem.
    **Preostala dva stvarna rješenja** (nijedno nije "project config", oba
    zahtijevaju korisnikovu akciju): (a) uključiti Windows Long Path podršku
    (`gpedit.msc` → Computer Configuration → Administrative Templates →
    System → Filesystem → "Enable Win32 long paths", ili na Windows Home
    registry `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem\
    LongPathsEnabled` = `1`, restart) - sistemska postavka, Claude je ne
    smije mijenjati sam; (b) premjestiti cijeli projekt na puno kraći put
    blizu root-a diska (npr. `C:\rac\`) - matematički vjerojatno NIJE
    dovoljno samo po sebi za reanimated (fiksni dio puta već ~165+ znakova
    prije nego se doda ijedan znak projektnog puta), realno treba
    kombinirati s (a).
    **Zaobilazno rješenje koje izbjegava cijeli problem:** `expo start` (bez
    `--dev-client`) + skeniranje QR koda u pravoj Expo Go aplikaciji na
    telefonu, umjesto `expo run:android`/custom dev client builda - Expo Go
    dolazi s unaprijed kompajliranim native binary-jem (uklj. reanimated/
    worklets za podržane verzije), pa nikakav lokalni Windows CMake/ninja
    build nije potreban. Ovo je bio originalni plan za live test faze 1
    (vidi sekciju 5) prije nego je korisnik promijenio `apps/mobile/
    package.json` `"android"` skriptu s `expo start --android` na
    `expo run:android`.

    **Nastavak istrage (isti bug, druga sesija u nizu):** korisnik je
    uključio Windows Long Path podršku (`LongPathsEnabled=1`, potvrđeno
    restartom), dodao Windows Defender iznimku za projekt folder, potvrdio
    da OneDrive nije aktivan - build i dalje puca identično, sad i na
    `expo-modules-core` uz `react-native-reanimated`. Sumnja na race
    condition je sustavno **isključena**: `gradlew --stop` + `taskkill`
    svih zaostalih Gradle/Kotlin daemon procesa, brisanje SVIH `.cxx`
    cacheva (i u `apps/mobile/android/app/.cxx` i u `C:/pnpm-vs` za sve
    native pakete) + `.kotlin` cachea, `org.gradle.workers.max=1` u
    `apps/mobile/android/gradle.properties` (forsira serijalizaciju, build
    potrajao 5m59s umjesto ranijih ~45s-2m30s) - **isti build failed, na
    IDENTIČNOM broju znakova (175) i identičnom fajlu**
    (`REASharedTransitionBoundaryShadowNode.cpp.o`). Determinizam kroz sve
    ove varijable (bez paralelizma, bez cachea, dva različita dana/sesije)
    dokazuje da ovo NIJE race condition nego čisto deterministički path-
    length overflow.

    **Ključan novi nalaz: Windows Long Path podrška NE rješava problem.**
    Ovo je iznenađujuće (long paths bi trebali dići real Windows limit s
    260 na ~32767 znakova) i implicira da specifični `ninja.exe`/`cmake`
    3.22.1 binary koji dolazi uz ovu verziju Android SDK cmake paketa
    vjerojatno nema stvarnu `\\?\`-prefix long-path I/O podršku ugrađenu
    (stariji Win32 alati moraju biti eksplicitno kompajlirani s
    `longPathAware` manifestom da bi iskoristili OS-level postavku - mnogi
    stariji bundlani NDK/cmake alati to nemaju). CMAKE_OBJECT_PATH_MAX
    (250) je CMake-ov vlastiti fiksni sigurnosni prag, neovisan o OS
    postavci - čak i teoretsko podizanje te varijable (`-D
    CMAKE_OBJECT_PATH_MAX=4096`, nije probano) možda ne bi pomoglo ako
    stvarni Windows `CreateFile` poziv unutar ninja.exe-a i dalje ne
    podržava duge putanje.

    **✅ RIJEŠENO (treća sesija u nizu iste istrage).** Korisnik je tražio
    da se nastavi kroz preostale opcije. Konačan, potvrđen fix:

    1. **Isključen race condition definitivno.** `gradlew --stop` +
       `taskkill` svih Gradle/Kotlin daemon procesa (potvrđeno da se ne
       respawnaju - nema Android Studija ni drugih pozadinskih procesa),
       `org.gradle.workers.max=1` (build 5m59s, serializacija stvarno
       primijenjena) - identičan fail na identičnom broju znakova. Zatim
       `org.gradle.parallel=false` (isključuje i project-level paralelizam,
       ne samo worker pool) + izolirani retry SAMO spornog taska
       (`./gradlew ":modul:buildCMakeDebug[arm64-v8a]"`, bez ičeg drugog u
       tijeku) - i dalje identičan fail, brzo (31-36s). Determinizam kroz
       potpunu izolaciju dokazuo da NIJE race condition.

    2. **Pravi uzrok #1: stari `cmake`/`ninja` (3.22.1, bundlan uz Android
       SDK) nema stvarnu Windows long-path podršku.** Ninja je dobio
       long-path podršku (`longPathAware` manifest + Unicode Win32 file
       API) tek u **v1.12** - Android SDK-ov cmake 3.22.1 paket je stariji
       od toga, pa OS-level `LongPathsEnabled=1` ne pomaže jer sam alat ne
       zna to iskoristiti. Provjereno da ni `react-native-reanimated` ni
       `react-native-worklets` ni `react-native-gesture-handler` ne pinaju
       eksplicitnu cmake verziju u svom `android/build.gradle(.kts)` - AGP
       koristi "default" (jedino instaliranu) verziju za sve module,
       uključujući third-party pakete iz `node_modules`.
       **Fix:** preuzet CMake 3.31.6 (Kitware GitHub release) + Ninja
       1.12.1 (ninja-build GitHub release) ručno, sastavljeni u
       `C:\android-cmake\bin\{cmake.exe,ninja.exe}` (ninja.exe kopiran u
       cmake-ov bin/ folder da AGP nađe oboje zajedno). Novi
       `apps/mobile/android/local.properties` (prije nije postojao) s
       `cmake.dir=C:\\android-cmake` - globalno prisiljava AGP da koristi
       ovaj toolchain za SVE native module, bez potrebe patchati bilo što u
       `node_modules`. Nakon ovoga: `react-native-worklets` i
       `react-native-reanimated` prošli čisto (potvrđeno paths u logu:
       `C:/android-cmake/bin/ninja.exe`).

    3. **Pravi uzrok #2: čak ni ninja 1.12.1 nema POTPUNU long-path
       podršku** - specifično za "phony edge, no inputs, does output exist"
       provjeru (drugačiji interni kod-put od glavnog compile/build koraka,
       koji JE radio ispravno i za duže putanje). `react-native-gesture-handler`
       je i dalje pucao na identičnom mjestu, deterministički, čak i nakon
       #1 i #2 iznad. Ninja `-d explain gesturehandler` (pokrenut RUČNO,
       izvan Gradlea, direktno u `.cxx` build direktoriju) otkrio je točan
       fajl: `.../prefab/arm64-v8a/prefab/lib/aarch64-linux-android/cmake/
       react-native-worklets/react-native-workletsConfigVersion.cmake`
       (AGP-ov prefab cross-modul dependency mehanizam, per-consuming-modul
       kopija). `wc -c` na taj puni put dao je **točno 260 znakova** -
       Windows-ov klasični `MAX_PATH` limit, točno na granici gdje
       `CreateFileW` bez long-path opt-ina puca. Potvrđeno da fajl NA DISKU
       stvarno postoji (nastao kao nusprodukt jednog od 100 CMake retry
       pokušaja) - ninjina stat-provjera ga ipak prijavljuje kao "ne
       postoji", dosljedno kroz ponovljene pokušaje.
       **Fix:** `virtual-store-dir` u `.npmrc` skraćen dodatno,
       `C:/pnpm-vs` (11 znakova) → `C:/v` (4 znaka), da se izgradi margina
       (ne samo skvicnuti na 259) kroz sve ABI varijante (`armeabi-v7a`/
       `arm-linux-androideabi` su 1-2 znaka dulji od `arm64-v8a`/
       `aarch64-linux-android`) i buduće native pakete. Zahtijeva full
       `rm -rf node_modules` + `pnpm install --virtual-store-dir "C:/v"`
       (obrazac iz ranije u ovom bugu - sama `.npmrc` vrijednost bez
       eksplicitnog CLI flaga se ne primjenjuje pouzdano).

    **Nakon sva tri fixa: `gradlew app:assembleDebug` prošao potpuno čisto,
    `BUILD SUCCESSFUL`, `374 actionable tasks: 374 executed`, APK generiran
    na `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
    (~217MB, debug build sa svim ABI-jima).**

    **Napomena za buduće sesije / drugi stroj:** ova tri artefakta su
    machine-specific i NIJESU dio projekta u smislu prenosivosti:
    `C:\android-cmake\` (ručno sastavljen CMake+ninja, izvan Android SDK-a),
    `C:\v\` (pnpm virtual store), `apps/mobile/android/local.properties`
    (sadrži apsolutni `sdk.dir` i `cmake.dir`, inače gitignored/machine-
    specific po konvenciji - vidi bug #20, projekt je od sljedeće sesije
    pravi git repo pa se ovo stvarno poštuje). Ako se `apps/mobile/android` ikad regenerira
    kroz `expo prebuild --clean`, `local.properties` će vjerojatno biti
    prepisan/izbrisan - treba ga ponovno kreirati s `cmake.dir=C:\\android-cmake`.
    Isto ako se `node_modules` ikad instalira bez `--virtual-store-dir
    "C:/v"` flaga, path-length bug #3 (gesture-handler) se vraća.

19. **Prije prvog deploya: git repo nije postojao.** `git init` u repo
    rootu, provjereno da `.gitignore` (root, već postojao) pokriva sve
    `.env` varijante na svim razinama monorepoa preko golog `.env` patterna
    (bez leading slasha - matcha na svakoj razini), i da postojeći
    `apps/mobile/.gitignore` (iz izvornog Expo scaffolda) već isključuje
    CIJELI `apps/mobile/android/` kao generirani folder - to je usput
    pokrilo i `local.properties` (SDK/cmake putanje) i ~3.6GB native build
    artefakata (APK, `.cxx`, `.gradle`) nakupljenih tijekom bugova #18-a,
    koji bi inače završili u prvom commitu. Prvi commit: 132 fajla, nula
    `.env` fajlova (samo `.env.example` placeholder), `git status` vizualno
    potvrđen prije commita. Push na GitHub NIJE rađen ovom sesijom -
    korisnik je ručno kreirao GitHub repo i sam ga povezao/pushao prije
    sljedeće sesije (Vercel projekt `fleet-manager-web` je već imao
    connected `bmalenica34-png/fleet-manager` repo i failed deploy kad je
    sljedeći bug prijavljen).

20. ⚠️ **Prvi Vercel deploy pukao na "turbo run build" - lanac od tri
    stvarna uzroka + jedan poznati CLI artefakt, riješeno kroz lokalnu
    reprodukciju preko `vercel build`.** Vercel dashboard log je pokazivao
    samo "Command 'turbo run build' exited with 1" bez detalja - trebalo je
    `npx vercel login` (OAuth device flow, korisnikova autorizacija u
    browseru) → `npx vercel link` → `npx vercel build` da se dobije puni
    output.

    **Usputna greška prije stvarnog posla:** `vercel link --project
    fleet-manager` (ime koje je korisnik naveo) nije pronašao postojeći
    projekt nego je STVORIO NOVI, prazan projekt "fleet-manager" (spojen na
    isti GitHub repo - rizik dupliciranih deploy-a na push). Pravi projekt
    s failed deploy-em zvao se `fleet-manager-web` (Root Directory
    `apps/web`, Node.js framework Next.js, potvrđeno `vercel project
    inspect`). Re-linkano na ispravan projekt. Prazan "fleet-manager"
    projekt NIJE obrisan (destruktivna akcija na tuđem računu, korisnik
    nije potvrdio) - treba ga ručno obrisati preko dashboarda ili
    `vercel project rm fleet-manager` ako se ne koristi.

    **Uzrok #1: Prisma Client se nikad nije generirao.** `@prisma/client`-ov
    ugrađeni postinstall hook pokušava auto-naći shemu na default lokaciji
    relativno na svoju vlastitu poziciju u `node_modules`, ne nalazi
    `packages/api/prisma/schema.prisma` (monorepo, shema nije u rootu),
    ispiše samo warning ("We could not find your Prisma schema in the
    default locations") i preskoči generiranje BEZ da padne install -
    zato je `pnpm install` uvijek "prošao čisto" dok je build kasnije pucao
    na `Module not found: Can't resolve '.prisma/client/default'`.
    **Fix:** eksplicitan `"postinstall": "prisma generate"` dodan u
    `packages/api/package.json` (radi bez ikakve pnpm `allowBuilds`
    dozvole - pnpm-ov script-ignoring security mehanizam gata samo
    third-party pakete u `node_modules`, ne workspace-ov vlastiti paket).

    **Uzrok #2: implicit `any` TypeScript greške u `packages/api/src/server/`
    koje lokalni `tsc --noEmit` prije nije uhvatio** (vjerojatno jer je taj
    check prošao protiv starog, cache-anog Prisma Client-a iz ranije
    sesije, prije nego je jučerašnje čišćenje `node_modules` za mobile
    Windows debugging prisililo svježu regeneraciju). Next.js-ov ugrađeni
    type-check (dio `next build`) je stroži/drugačiji od golog `tsc
    --noEmit` poziva i uhvatio je stvarne, prije neotkrivene bugove:
    `.map()` callback parametri nad nizovima izvedenim iz Prisma query
    rezultata (`duplicates.map((d) => ...)`, `contracts.map(({ annexes,
    photoRequests, ...contract }) => ...)`, `contract.handoverPhotos.map(
    async (photo) => ...)`, `vehicle.images.map((image) => ...)`) su
    dobivali implicit `any` bez eksplicitne anotacije. **Fix:** eksplicitni
    tipovi na svih 6 mjesta (`auth.ts`, `contracts.ts` x2, `documents.ts`,
    `vehicles.ts` x2) - uvezen odgovarajući Prisma model tip (`Client`,
    `HandoverPhoto`, `VehicleImage`) ili `(typeof niz)[number]` gdje je tip
    lokalno inferiran (kompleksni `include`-bazirani Prisma payload).

    **Uzrok #3: Vercel projekt nije imao NIJEDNU app env varijablu
    postavljenu** (`vercel pull --environment production` je pokazao samo
    Vercelove sistemske vars - `VERCEL_*`, `TURBO_*` - ništa od
    `DATABASE_URL`/Supabase/Hetzner/Resend/signing-cron secreta). **Fix:**
    svih 18 varijabli iz root `.env` postavljeno preko `vercel env add
    <NAME> <environment>` (vrijednost cijevljena preko stdina, ne kao CLI
    argument - ne završava u process listi/historyju) za `production` I
    `preview` okruženje. `NEXT_PUBLIC_OWNER_APP_URL` i
    `NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL` NISU kopirani s lokalne
    `localhost:3000` vrijednosti nego postavljeni na stvarni Vercel URL
    (`https://fleet-manager-web-branimir-s-projects1.vercel.app`) -
    korisnik treba ažurirati ako/kad doda custom domenu, inače magic-link
    mailovi u produkciji vode na krivi URL.

    **Preostali, NEriješeni artefakt (nije naš bug):** `vercel build` i
    dalje puca s `"Unable to find lambda for route: /portal/login"` NAKON
    što je `next build` sam potpuno čisto prošao (svi route manifesti
    ispravni, nula compile grešaka - potvrđeno dvaput, i bez i sa pravim
    env varijablama). Istraženo: nije duplicate ruta, nije `vercel.json`
    "routes" override (projekt ima samo "crons" ključ), nije middleware-
    specifično (`/login`, isto statična ruta pod middlewareom, prolazi bez
    problema). Web istraga potvrdila da je "Unable to find lambda for
    route" **poznat, generički Vercel CLI bug** koji pogađa nepovezane rute
    u desetcima nepovezanih projekata (`/favicon.ico`, `/en`, `/index`,
    `/recommend`...) kroz razne Next.js verzije - specifičan za lokalni
    `vercel build` → `vercel deploy --prebuilt` dvokoračni CLI put, ne za
    stvarni cloud build pipeline (zajednica potvrđuje da pravi deploy-i
    prolaze unatoč ovome). **Nije dalje popravljano** - odluka da se
    push-a i pusti da PRAVI Vercel cloud deploy bude konačni test, umjesto
    daljnjeg lova na CLI-only artefakt.

    **✅ Potvrđeno nakon push-a: pravi Vercel deploy je uspio** (`vercel ls`
    → `● Ready`, build trajao 2min) - hipoteza o CLI-only artefaktu bila je
    točna, stvarni cloud pipeline nije pogođen. Živi URL:
    `https://fleet-manager-web-branimir-s-projects1.vercel.app`.
    Napomena: `/login` i `/portal/login` trenutno vraćaju 302 na
    `vercel.com/sso-api` - to je Vercel-ov vlastiti **Deployment
    Protection (SSO)**, projekt-level postavka koja traži da SVAKI
    posjetitelj (uklj. buduće klijente/vlasnika) bude prijavljen na
    Vercelov tim prije nego vidi ijednu stranicu. Nije aplikacijski bug -
    ako stranica treba biti javno dostupna (a hoće, klijenti nisu na
    Vercel timu), treba je isključiti u Vercel dashboardu: Project Settings
    → Deployment Protection. Nije dirano ovom sesijom (project-setting
    odluka, izvan dosega "popravi build" zadatka).

21. **Mobile prebačen s lokalnog dev servera na produkcijski Vercel
    backend.** Nakon što je korisnik potvrdio da je backend live na Vercelu
    i Deployment Protection isključen (ručno, izvan Claude-a, potvrđeno
    testom), `apps/mobile/.env` `EXPO_PUBLIC_API_BASE_URL` promijenjen s
    `http://10.239.153.5:3000` (LAN IP dev servera, postavljen pri modul 7
    fazu 1 setupu) na
    `https://fleet-manager-web-branimir-s-projects1.vercel.app`.
    `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` nepromijenjeni
    (isti Supabase projekt, dev i produkcija dijele bazu - nema odvojenog
    staging Supabase projekta). Expo/Metro dev server (`expo start
    --dev-client`) je bio pokrenut u pozadini pri promjeni - ugašen i
    ponovno pokrenut da pokupi novu `.env` vrijednost (Expo učitava
    `EXPO_PUBLIC_*` varijable jednom pri startu procesa, ne hot-reloada ih
    na promjenu fajla). Posljedica: telefon više ne mora biti na istoj
    WiFi mreži kao razvojno računalo za testiranje mobilea - poziva pravi
    Vercel URL koji je dostupan bilo gdje.

22. ⚠️ **Vercel Deployment Protection NIJE stvarno bio isključen** (unatoč
    korisnikovoj potvrdi "isključen, testirano i radi") - "test kroz
    browser radi" je lažno pozitivan jer je korisnikov browser već imao
    aktivnu Vercel dashboard sesiju (SSO cookie), pa je transparentno
    prošao zaštitu. Mobile app (bez browser sesije) je na svaki API poziv
    dobivao `401` s tijelom `{"protection":{"vercel_auth_enabled":true,
    ...},"error":{"code":"401","message":"Protected deployment"}}` -
    potvrđeno direktnim `curl` pozivom na produkcijski URL, ponovljeno 3x,
    dosljedno.

    **Usput otkriven pravi bug u mobile error handlingu koji je ovo
    sakrio:** `apps/mobile/src/lib/api.ts` `apiFetch` je radio `throw new
    Error(body?.error ?? ...)` pretpostavljajući da je `body.error` uvijek
    string (tako naša vlastita API vraća greške - `{error: "not_authorized"}`
    itd). Vercelov protection-error JSON ima DRUGAČIJI oblik -
    `error` je OBJEKT (`{code, message}`), ne string. `new Error(objekt)`
    tiho coerca argument u `"[object Object]"` preko `String()` - zato je
    login ekran pokazivao tu besmislenu poruku umjesto stvarnog uzroka.
    **Fix:** `apiFetch` sad provjerava je li `body.error` string, inače
    pokušava `body.error.message`, inače fallback na
    `request_failed_<status>` - radi ispravno i za naš oblik grešaka i za
    Vercelov. Nakon fixa login ekran ispravno pokazuje "Protected
    deployment".

    **Preostaje korisnikova akcija:** stvarno isključiti Deployment
    Protection u Vercel dashboardu (Project Settings → Deployment
    Protection → Vercel Authentication → Off) - dosad samo NAVODNO
    isključeno, provjera mora biti preko zahtjeva BEZ Vercel sesije (npr.
    curl, ili mobile app, ne ulogirani browser) da se izbjegne isti lažni
    pozitivan test.

23. ⚠️ **Nakon što je Deployment Protection stvarno isključen: `500
    Internal Server Error` (prazan body) na svaki API poziv.** `vercel
    logs` (runtime function logovi, ne build logovi) otkrio pravi uzrok:
    `PrismaClientInitializationError: Prisma Client could not locate the
    Query Engine for runtime "rhel-openssl-3.0.x"`. Poznat, dobro
    dokumentiran Prisma+Vercel problem - `prisma generate` (naš postinstall
    iz bug #20) generira query engine binary za platformu na kojoj se
    pokreće, ali Vercel-ov build kontejner (gdje se `pnpm install`
    izvršava) i stvarni Lambda runtime kontejner (gdje se funkcija
    izvršava po requestu) nisu nužno identična okolina - default
    "native" binary target ne pokriva `rhel-openssl-3.0.x`.
    **Fix:** `packages/api/prisma/schema.prisma` generator blok dobio
    `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (native i dalje
    treba za lokalni Windows dev). Nakon push-a, Vercel-ov postinstall
    `prisma generate` regenerira klijenta s oba binary targeta uključena
    u bundle.

    **Napomena za debugging metodu:** `vercel inspect <url> --logs`
    pokazuje samo BUILD logove (turbo/next build output), ne runtime
    greške. Za stvarni stack trace API rute koja puca u produkciji treba
    `vercel logs <deployment-host>` (runtime function invocation logovi) -
    ova razlika je izgubila vrijeme prije nego je pronađen pravi log izvor.

    **Prvi fix (samo `binaryTargets` u schema.prisma) NIJE bio dovoljan -
    ista greška se ponovila na sljedećem deployu.** Uzrok: `pnpm install`
    na Vercelu je "Already up to date" (lockfile/package.json nepromijenjen
    otkad je postinstall prvi put dodan bug #20-om), pa se `postinstall`
    hook uopće nije ponovno pokrenuo - Prisma Client je ostao generiran sa
    STAROM shemom (bez rhel targeta), unatoč tome što je schema.prisma
    promijenjena i push-ana. `vercel inspect --logs` na najnoviji deploy to
    je potvrdio - build log uopće ne spominje "prisma"/"postinstall".
    **Pravi fix:** `"build": "prisma generate"` dodan u
    `packages/api/package.json` (uz postojeći `postinstall`, koji ostaje
    koristan za lokalni dev). Turbo-ov `build` task već ima `dependsOn:
    ["^build"]` u `turbo.json`, pa `@rent-a-car/web:build` sad UVIJEK prvo
    pokrene `@rent-a-car/api:build` (`prisma generate`) kao dio pravog
    turbo task grafa - cache-key uključuje `schema.prisma` kao input, pa se
    pouzdano re-generira na svaku promjenu sheme, neovisno o tome je li
    `pnpm install` cache-iran/preskočen. Potvrđeno lokalno (`pnpm turbo run
    build --filter=@rent-a-car/web` - `@rent-a-car/api:build` izvršen prije
    `@rent-a-car/web:build`, oba "cache miss, executing" na prvi pokušaj sa
    izmijenjenom shemom).

    **Ni to nije bilo dovoljno - ISTA greška na sljedećem deployu, iako je
    `prisma generate` sad pouzdano izvršen s ispravnim `binaryTargets`.**
    Pravi, treći sloj problema: Next.js-ov file tracer (`@vercel/nft`,
    odlučuje koji fajlovi idu u serverless function bundle) ne prati
    Prisma-in query engine `.so.node` binary jer se on učitava dinamički
    (po file-path stringu u runtimeu), ne preko `require()`/`import`
    poziva koje statička analiza vidi - i taj problem je posebno izražen u
    pnpm monorepo layoutu (duboko ugniježđeni `.pnpm` store). Ovo je
    poznat, Prisma-om službeno dokumentiran problem
    (prisma.io/docs → Deploy to Vercel, monorepo sekcija) sa službenim
    rješenjem: **`@prisma/nextjs-monorepo-workaround-plugin`** - webpack
    plugin koji eksplicitno kopira engine binary u bundle.
    **Fix:** `pnpm --filter web add -D @prisma/nextjs-monorepo-workaround-plugin`,
    pa u `apps/web/next.config.mjs` dodan `webpack` hook koji (samo za
    server build, `isServer` provjera) doda `new PrismaPlugin()` u
    `config.plugins`. Potvrđeno lokalno da `.next/server/chunks/
    libquery_engine-rhel-openssl-3.0.x.so.node` sad stvarno postoji u
    outputu (`find .next -iname "*rhel*"`) prije push-a - tri prijašnja
    "fixa" (binaryTargets, turbo build graph, deployment protection off)
    su bili nužni ali ne i dovoljni koraci, ovo je bio četvrti i konačni
    sloj istog lanca.

24. ⚠️ **Mobile app se zaglavljivao na `auth-callback` ekranu nakon klika
    na magic link - beskonačan spinner, bez greške.** Root cause NIJE bio
    server (potvrđeno: direktan `curl` na `/api/auth/mobile/resolve` s
    pravim Bearer tokenom - generiranim preko Supabase Admin API
    `generateLink` + `verifyOtp`, bez potrebe za klikom na pravi mail -
    vratio `200 OK` za ~2.3s; `vercel logs` za taj endpoint pokazao SAMO
    moje test pozive, NIJEDAN sa stvarnog telefona). Zaključak: zahtjev s
    telefona nikad nije ni stigao do servera - hang je na mobile strani,
    ili u deep-link handlingu (`Linking.getInitialURL()`/`addEventListener`
    nikad ne uhvate URL) ili u `supabase.auth.setSession()` pozivu, prije
    ijednog network poziva na naš backend. Točan uzrok NIJE identificiran
    (nije se moglo debugirati na fizičkom uređaju iz ove sesije).
    **Fix (čini hang nemogućim ubuduće, umjesto lova na točan uzrok):**
    - `apps/mobile/src/lib/api.ts` `apiFetch` - goli `fetch()` nije imao
      nikakav timeout, pa spor/mrtav mrežni put ostavlja pozivatelja
      zauvijek u "loading" stanju. Dodan `AbortController` s 15s
      timeoutom, `AbortError` se prevodi u čitljiv `"request_timeout"`.
    - `apps/mobile/app/auth-callback.tsx` - dva nova safety-neta: (1) ako
      se deep link UOPĆE ne uhvati u 20s (ni `getInitialURL` ni `url`
      event), `stuckTimer` postavlja error state umjesto vječnog spinnera;
      (2) `supabase.auth.setSession()` omotan u `withTimeout` helper (20s)
      za slučaj da SAM Supabase poziv visi. Error ekran sad ima i "Natrag
      na prijavu" gumb (`router.replace("/login")`) - prije nije postojao
      IZLAZ iz error stanja, samo statična poruka.
    - `AuthProvider`s `resolveForSession` catch (već postojao) sad stvarno
      radi kako je zamišljeno - prije je čekao fetch koji se NIKAD ne bi
      odbio (bez timeouta), sad se odbija nakon 15s pa correctly pada na
      `status: "signed-out"`.
    **Preostaje za sljedeću sesiju s pristupom uređaju:** kad se error
    stanje pojavi, poruka ("timeout" vs `sessionError.message` vs
    `invalid_link`) će konačno reći KOJI konkretan korak visi - do sada je
    to bilo nemoguće znati jer se ništa nije nikad prikazalo.

25. ⚠️ **"send_failed" greška na `/api/auth/{owner,client}/request-link` -
    NIJE kod bug, Supabase-ov ugrađeni email rate limit potrošen.**
    Route je i prije ovog bug-a ispravno hvatao `signInWithOtp` grešku, ali
    ju je gutao u generički `{error: "send_failed"}` bez logiranja pravog
    razloga. Dodan `console.error(...)` prije returna u obje request-link
    rute (owner i client) - trajno korisno, ne samo za ovaj debug. Nakon
    toga, `vercel logs` otkrio pravi uzrok:
    `AuthApiError: email rate limit exceeded, status: 429, code:
    'over_email_send_rate_limit'`. Supabase-ov DEFAULT/ugrađeni email
    servis (shared SMTP, namijenjen samo za testiranje) ima vrlo nizak
    limit (par mailova na sat) - iscrpljen nakupljenim testiranjem kroz
    cijelu sesiju (curl testovi iz bugova #22/#23/#24 + korisnikovi vlastiti
    pokušaji, svi na isti `b.malenica34@gmail.com`).
    **Kratkoročno:** pričekati ~1h da se limit resetira, izbjegavati
    gomilanje test zahtjeva u kratkom periodu.
    **Trajno rješenje (nije napravljeno ovom sesijom - Supabase dashboard
    akcija, korisnikovi kredencijali):** postaviti custom SMTP u Supabase
    dashboardu (Authentication → Email Templates/SMTP Settings) preko
    Resenda - projekt već ima `RESEND_API_KEY` za druge mailove (module 4),
    isti provider bi se mogao iskoristiti i za Supabase Auth mailove da se
    izbjegne ugrađeni limit prije stvarne upotrebe s pravim klijentima.

26. **`RESEND_FROM_EMAIL` prebačen s privremenog `onboarding@resend.dev`
    na pravu adresu s verificirane domene, `noreply@navalis-cissa.hr`**
    (korisnik verificirao domenu u Resendu, izvan ove sesije). Ažurirano
    na tri mjesta: root `.env` (izvor istine, ovom sesijom već bio
    ažuriran prije nego je zatraženo), `apps/web/.env` (sinkroniziran s
    rootom, isti obrazac kao uvijek), i Vercel Production + Preview env
    (preko `vercel env rm` + `vercel env add`, nema direktan "update").
    **Vercel env varijable se ne primjenjuju retroaktivno na postojeći
    deployment** - triggeran redeploy preko `vercel redeploy <deployment-
    url> --target production` (ne `vercel --prod`, koji pokušava lokalni
    upload cijelog radnog direktorija - pukao na 1.8GB uploadu jer bi
    pokupio i node_modules/build cacheve bez `.vercelignore`-a; `redeploy`
    umjesto toga rebuilda POSTOJEĆI deployment iz Gita, brzo i čisto).
    Redeploy uspio (`✓ Ready in 2m`), glavni alias `fleet-manager-web-
    branimir-s-projects1.vercel.app` potvrđeno odgovara na novom buildu.
    **Napomena:** stvarna "From" adresa u poslanom mailu NIJE testirana
    pravim slanjem (izbjegnuto trošenje preostalog Resend/Supabase
    send kvota nakon bug #25) - potvrđeno je da je vrijednost ispravno
    spremljena u Vercel config za oba okruženja i da je nova build
    verzija live, što je dovoljno da se runtime `process.env` ažurirao
    (Next.js API rute čitaju env svježe pri svakom pozivu).

27. **Nastavak bug #24 - timeout fix radi (potvrdio korisnik: error se
    pojavljuje nakon ~20s), ali ekran zaglavljen na `auth-callback`-u i
    dalje se ne zna GDJE stane.** Oba timeout puta ("URL nikad uhvaćen"
    vs "setSession() visi") su davala IDENTIČNU poruku ("timeout"), pa
    korisnikov izvještaj "predugo traje" nije davao dovoljno signala da se
    zna koji od ta dva slučaja je pravi uzrok. `vercel logs` potvrdio da
    `/api/auth/mobile/resolve` (poziva se TEK nakon uspješnog
    `setSession()`) nikad nije pozvan s pravog uređaja - dakle problem je
    definitivno prije bilo kakvog poziva na naš backend, u samom deep-link
    handlingu ili u Supabase klijentovom `setSession()`.
    **Fix (opet dijagnostika, ne popravak - nema pristupa uređaju):**
    `apps/mobile/app/auth-callback.tsx` sad prati `stage`
    (`waiting_for_url` → `url_captured` → `setting_session`) i svaki od
    dva timeout puta ima SVOJU, različitu poruku: "App nije primio link iz
    maila..." (stuck timer prije ijednog URL-a) vs "Prijava se predugo
    obrađuje - poveznica je stigla, ali potvrda nije uspjela..." (setSession
    timeout, URL JE uhvaćen). Dodani `console.log` na svaki korak
    (getInitialURL rezultat, 'url' event, ulazak/izlazak iz setSession) -
    vidljivi u Metro logu dok je telefon spojen na dev server, jedini
    trenutno dostupan uvid u ponašanje na fizičkom uređaju.
    **Sumnja (nepotvrđena):** Supabase-ova hosted "confirm" stranica
    (na koju magic-link mail prvo vodi prije redirecta na
    `rentacarmanager://`) ponekad ne uspije auto-redirectati na custom
    scheme iz in-app browsera mail aplikacije (poznat, čest Android/iOS
    gotcha) - ako se to potvrdi sljedećim testom (poruka "App nije primio
    link"), rješenje bi bilo koristiti Supabase-ov `redirectTo` s
    Universal/App Links umjesto golog custom scheme-a, ili uputiti
    korisnika da eksplicitno otvori link u sistemskom browseru.

**Owner/Client role razdvajanje preko DB tablice, ne Supabase custom claims.**
`Owner` model (`id, email @unique, userId? @unique, name`) je izravna
kopija postojećeg `Client.userId` obrasca. Razlog: konzistentnost s
postojećim mentalnim modelom, izbjegava Admin API pozive za upravljanje
`app_metadata` (dodatna pokretna komponenta, dodatan izvor istine), direktno
upitno/joinabilno u Prisma kodu. Owner redovi se pre-provisioniraju ručno
po emailu (allowlist) — login stranica odbija email koji nije u tablici
PRIJE nego se magic link uopće pošalje, ne nakon.

**Linking na svaki login, ne samo pri registraciji.** Owner obično bira
klijenta iz padajućeg popisa pri kreiranju ugovora (isti `Client` red se
ponovno koristi), ali ako owner greškom kreira novi `Client` red za istog
čovjeka, taj drugi red ostaje "gost" dok se ne poveže. `linkGuestClientsToUser`
se zato zove na SVAKOM loginu (idempotentno — no-op ako nema ničeg za
povezati). Case-insensitive email match (lowercase pri upisu + Prisma
`mode: "insensitive"` pri čitanju). Duplikati: userId se poveže na
najstariji "gost" red, ugovori ostalih duplikata se premjeste na taj isti
red (inače bi ostali nepovezani i nevidljivi klijentu).

**Magic-link-only za v1, ne i SMS OTP** (CLAUDE.md dopušta "i/ili"). Magic
link direktno daje Supabase-verificirani email za mapiranje na `Client.email`;
OTP bi trebao odvojenu phone-based matching logiku. Ostavljeno za kasnije
ako zatreba.

**Nikakva dodatna potvrda za auto-linkanje gost-ugovora.** Supabase-ova
magic-link verifikacija (klik = dokaz pristupa toj pošti) je sama po sebi
dovoljan dokaz vlasništva emaila — dodatni "potvrdi povezivanje" korak bi
bio suvišno trenje.

**`*Key` umjesto `*Url` konvencija.** Sva polja koja čuvaju putanju do fajla
(`registrationDocKey`, `contractPdfKey`, `signatureKey`, itd.) spremaju S3
key, NE raw URL. Presigned URL se generira on-demand pri svakom čitanju
(kratak TTL, tipično 900s). Ovo je eksplicitno spomenuto u CLAUDE.md
("nikad ne vraćati raw file pathove") i namjerno provedeno kroz cijelu
shemu od početka.

**Jedan Next.js app s route grupama, ne 4 odvojene web app-a.** Originalni
CLAUDE.md opisuje `owner-web`/`client-web` kao odvojene appove, ali
korisnikova stvarna prva poruka u sesiji je eksplicitno tražila samo
`apps/web` + `apps/mobile` (2 appa, ne 4) — pratili smo to. Owner dashboard
je `(owner)` route grupa, client portal je `portal/(protected)` route
grupa, javni token-flow-ovi (`/sign`, `/extend`, `/request-photos`) su izvan
obje grupe (nemaju owner nav).

**Best-effort PDF/mail nakon potpisa.** Generacija PDF-a i slanje maila
nakon `completeSigning`/`completeAnnexSigning` je omotano u try/catch koji
NE ruši uspješno spremljen potpis. Legalno značajan čin (potpis) je već
persistiran prije nego se PDF/mail pokušaju — ako ti koraci padnu, greška
se logira (`console.error`), ali klijent i dalje vidi "uspješno potpisano".

**Middleware radi samo grubu provjeru, layout.tsx radi stvarnu.**
Middleware (`src/middleware.ts`) provjerava SAMO "postoji li Supabase sesija"
preko cookieja (Edge-kompatibilno, bez DB poziva). Stvarna provjera uloge
(je li ovaj user Owner ili Client) ide u `(owner)/layout.tsx` i
`portal/(protected)/layout.tsx` Server Componentima — ti rade u Node
runtimeu i mogu upitati Prisma. Prisma ne radi u Edge middlewareu, pa se
ovo MORA razdvojiti ovako.

**Owner API rute su zasebno zaštićene, ne samo stranice.** `requireOwnerSession()`
helper se poziva na početku svake owner-facing API rute
(`/api/vehicles`, `/api/clients`, `/api/contracts`, itd.) — jer middleware
+ stranica-level redirect NE štiti direktan poziv na API endpoint. Provjereno
eksplicitno: `GET /api/vehicles` bez sesije → `401`.

**Flat dedupe polja umjesto tracking tablice** (`registrationReminder7SentAt`
itd. na `Vehicle`). Konzistentno s postojećim stilom projekta (flat polja
radije nego nova tablica za mali tracking problem).

**Dva odvojena cron endpointa** (`check-expiring`, `check-registrations`)
umjesto jednog kombiniranog. Razdvajanje odgovornosti, isti obrazac "jedna
ruta = jedna briga" kao ostatak projekta.

---

## 4. Poznata ograničenja / svjesni kompromisi

1. **Slovo "đ" u dinamičkom PDF tekstu** (imena klijenata, opisi oštećenja
   koje unosi klijent) može nedostajati u renderiranom PDF-u — popravljeno
   je samo u statičkom tekstu template-a. Pravi fix bi trebao embedded
   Unicode font (`Font.register`) — nije rađeno jer nosi rizik (vanjska
   ovisnost o fontu ili bundling komplikacije) nesrazmjeran trenutnoj
   vrijednosti. Č, ć, š, ž rade ispravno.

2. **Potpis u PDF-u nije auto-cropan** (`getCanvas()` umjesto
   `getTrimmedCanvas()`) — uključuje prazan prostor oko same crte potpisa.
   Kozmetičko, ne funkcionalno.

3. **Nema price/cijena polja na Contractu.** Originalni CLAUDE.md data model
   nikad nije uključivao cijenu najma, pa je ni PDF ugovori ni baza ne
   prikazuju. Ako stvarni ugovor treba navesti cijenu, treba dodati polje +
   ažurirati `ContractPdf.tsx`.

4. **Nema automatiziranih testova.** Sva verifikacija je bila
   typecheck + build + ručno/live testiranje kroz browser. Nema Jest/Playwright
   test suitea.

5. **SMS OTP login nije implementiran**, samo magic link (vidi arhitektonsku
   odluku).

6. **Photo request wizard traži samo 4 obavezna kuta** (front/back/left/right).
   `PhotoAngle` enum ima i `interior_dashboard`, `interior_seats`, `odometer`,
   `other`, ali nijedan trenutni wizard (signing ni photo-request) ih ne
   traži — dostupni su u shemi za buduće proširenje.

7. **`packages/api/.env` se mora ručno kreirati/brisati** za svaku Prisma
   CLI komandu ili scratch skriptu (vidi bug #7). Ovo je stvarno smetnja,
   ne bug — ako postane repetitivno, razmisliti o trajnom (ali gitignored)
   `packages/api/.env` umjesto copy/delete ciklusa.

8. **`apps/mobile` ima auth + navigacijski skeleton (modul 7, faza 1), ali
   još nema feature ekrane.** Login/magic-link/role-routing/logout rade
   (kodno, čeka live test na uređaju — vidi sekciju 5). Owner ima samo
   placeholder home s brojem vozila, client ima placeholder home bez
   podataka. Nema popisa vozila/ugovora, kreiranja ugovora, photo requesta,
   ni ijednog client-facing podatka na mobileu još.

9. **Vlasnik (Owner) i test klijent dijele isti mail** (`b.malenica34@gmail.com`)
   jer je korisnik tražio test s vlastitim emailom. Zato callback nakon
   logina UVIJEK šalje tog usera na `/vehicles` (owner ima prioritet u
   redirect logici), čak i kad je login iniciran s `/portal/login` — treba
   ručno otići na `/portal` da se vidi client view. Ovo je očekivano
   ponašanje za taj specifični test account, ne bug.

---

## 5. Sljedeći korak i preostali redoslijed

**Modul 7, Faza 1 (auth + skeleton) je kodno gotova, čeka live test na
uređaju** — vidi detalje u sekciji 1 pod "Modul 7". Prvi konkretni koraci pri
nastavku:

1. U Supabase dashboardu (Authentication → URL Configuration) ručno dodati
   `rentacarmanager://**` na redirect URL allowlistu — bez ovoga magic link
   na custom scheme neće proći Supabase-ovu provjeru. Ovo NIJE napravljeno
   ovom sesijom (dashboard akcija, izvan dosega alata).
2. `pnpm --filter mobile start` (ili `pnpm --filter mobile android/ios`),
   otvoriti u dev-client appu na telefonu, login kao owner
   (`b.malenica34@gmail.com`), kliknuti pravi magic link, potvrditi routing
   na `owner/home` + live broj vozila + session persistencija + logout.
   `EXPO_PUBLIC_API_BASE_URL` gađa produkcijski Vercel backend od bug #21 —
   telefon više NE mora biti na istoj mreži kao računalo.
3. Za pravi client-only test (ne owner) treba drugi test email iz baze
   (vidi sekciju 6) jer owner i glavni test client dijele isti mail, pa
   `/api/auth/mobile/resolve` uvijek vraća `role: "owner"` za taj mail
   (identična prioritet-logika kao web callback, vidi ograničenje #9 dolje).

**Nakon što faza 1 live-testira uspješno, preostale faze modula 7** (nisu
još planirane u detalje):
- Owner-mobile feature ekrani: popis/detalj vozila, kreiranje ugovora,
  photo request trigger.
- Client-mobile feature ekrani: pregled ugovora, dokumenti, potpis, zahtjev
  za produženje — ovo će trebati i nove backend komade (`requireClientSession`
  helper + client-facing JSON API rute ne postoje još ni za web, portal je
  danas server-rendered HTML).
- Push notifikacije (CLAUDE.md ih spominje, nerazrađeno i za web — sve je
  trenutno email-only preko Resenda).

Nakon modula 7, originalni CLAUDE.md plan je time u potpunosti pokriven.
Moguća buduća proširenja izvan izvornog plana (nisu tražena, samo za
svijest): SMS OTP login, cijena najma na ugovoru, embedded font za puni
hrvatski charset u PDF-ovima, automatizirani testovi.

---

## 6. Stanje test podataka u bazi

Baza (Supabase Postgres) sadrži nakupljene test podatke iz svih sesija
testiranja. Nije rađeno čišćenje (korisnik nije tražio). Korisno za
nastavak testiranja:

- **Vozilo "Volkswagen Golf" (ZG1234TEST)** — glavno test vozilo korišteno
  kroz module 2-6. Ima uploadane slike/prometnu iz raznih testova.
- **Vozilo "proba proba1" (ZGPROBA)** — kreirao ga je korisnik ručno pri
  testiranju. Trenutno ima `registrationExpiresAt` postavljen (iz testa
  modula "registracije"), s `registrationReminder3SentAt` već popunjenim
  (3-dan milestone je već "iskorišten" — ako treba ponovno testirati taj
  cron, ili promijeni datum ili ručno resetiraj to polje). Ima i aktivan
  potpisan ugovor (`dateFrom` -2 dana, `dateTo` +5 dana od trenutka kreiranja)
  korišten za photo-request test — taj ugovor već ima 4 `HandoverPhoto`
  zapisa (fake canvas-generirane slike, ne prave fotografije) i jedan
  ispunjen `PhotoRequest`.
- **Owner: `b.malenica34@gmail.com`** — pravi email korisnika, provisioniran
  kao Owner (allowlist), `userId` je popunjen nakon što je korisnik osobno
  potvrdio pravi magic-link login ("testirano, radi").
- **Client "Brane Malenica" (`b.malenica34@gmail.com`, OIB `77766655544`)**
  — kreiran namjerno da korisnik testira client portal auto-linkanje na
  vlastiti email. Ima jedan "signed" test ugovor BEZ pravih PDF-ova/potpisa/
  slika (kreiran direktno u bazi, ne kroz pravi signing flow) — na `/portal`
  će "Dokumenti" kolona pokazati "—".
- **Više test klijenata** iz modula 2-6 testiranja (Test Klijent,
  Test2 Klijent2, Test4-9 s raznim sufiksima, `test.klijent@example.com`)
  — vezani na razne test ugovore, neki s pravim PDF-ovima/slikama/potpisima
  (oni napravljeni kroz stvarni `/sign/[token]` flow s canvas-generiranim
  PNG slikama), neki bez (kreirani direktno u bazi kao shortcut za testiranje
  kasnijih modula).
- **Nekoliko `Annex` zapisa** iz modula 5 cron testiranja, neki `signed`
  (produžili su `Contract.dateTo` na test ugovorima).

**Napomena za nastavak:** ako novi test treba "čist" aktivan ugovor,
najbrže je kreirati novi direktno preko Prisma scratch skripte (obrazac
korišten kroz cijelu sesiju: `cp .env` u `packages/api/`, napiši `.mjs`
skriptu, `node --env-file=.env skripta.mjs`, obriši skriptu i `.env` nakon)
umjesto kroz UI — owner API rute su sad auth-zaštićene pa UI put zahtijeva
pravu ulogiranu sesiju koju alat-browser ne može lako dobiti (PKCE
ograničenje — magic link mora biti kliknut u ISTOM browseru koji ga je
zatražio, vidi bug #14).
