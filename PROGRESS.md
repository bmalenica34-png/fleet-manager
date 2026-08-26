# Rent-a-Car Manager — Progress Log

Dinamički log stanja projekta. Ažurira se na kraju svake sesije. Za statičnu
arhitekturu/konvencije vidi [CLAUDE.md](CLAUDE.md) — ovaj dokument je "što je
gotovo i zašto", ne "kako treba izgledati".

**Zadnje ažurirano:** 2026-08-26, tridesetšesti nastavak - tri prijavljena
buga iz produkcijskog testiranja prošlog nastavka (payment tracking),
popravljena dva, treći ispao false positive nakon istrage.

**1) "Najmovi" 'neplaćeno' filter pokazivao SVE buduće periode.** Popravak
je ISKLJUČIVO client-side - `listRentPayments()` i dalje vraća SVE retke
(server-side filtriranje bi onemogućilo "Sve" tab da bude puni informativni
raspored). Umjesto nove "stranica ugovora" (ne postoji per-contract detail
stranica u appu, ne gradi se samo za ovo - "Sve" tab na POSTOJEĆOJ Najmovi
stranici već ispunjava tu ulogu, nefiltriran), filter logika u
`(owner)/najmovi/page.tsx` i `owner/najmovi.tsx` (mobile) promijenjena:
"Neplaćeno" = `!paid && dueDate <= danas` (bilo samo `!paid`). "Ukupno
neplaćeno" zbroj na vrhu prati isti kriterij. `dueDate` korišten (ne
`periodStart` - trenutno identični po dizajnu, ali `dueDate` je
semantički ispravnije polje za "je li dospjelo"). Verificirano scratch
testom protiv produkcije: pravi 4-tjedni ugovor → "neplaćeno" filter vraća
TOČNO 1 (tekući tjedan), "sve" prikaz i dalje vraća sva 4.

**2) T&C PDF nije imao potpis.** `TermsPdfProps` NIJE uopće imao
`signatureUrl` polje (za razliku od ContractPdf/ProtocolPdf) -
`finalizeContractDocuments` (server/documents.ts) je već imao gotov
`signatureUrl` u scope-u (isti presigned URL korišten za druga dva PDF-a),
samo ga nije proslijedio u `renderTermsPdf()` poziv. Dodan `signatureUrl`
prop + "Potpis korisnika" blok u `TermsPdf.tsx` (isti stil/`signatureImage`
kao ostala dva PDF-a), proslijeđen u `documents.ts`. Verificirano
generiranjem stvarnog test PDF-a (`npx tsx` + `renderTermsPdf` izravno) -
potpis se vizualno pojavljuje.

**3) "Učešće zamjenjuje ukupnu cijenu" - ISTRAŽENO, NIJE bug.** Iscrpna
pretraga (svaka referenca na `excessAmount`/`depositAmount`/`pricePerDay`
u cijelom repou, uklj. sign/extend/request-photos stranice, email
template-i) nije našla nijedan kod-put koji bi mogao uzrokovati miješanje.
Generiran i vizualno pregledan test contract PDF s tri različite vrijednosti
(800/500/200) - sve ispravno odvojeno prikazano. Korisnik potvrdio nakon
pitanja: testni ugovor ("DEBUG-TERMS-1", 750€ ukupno) je imao **ručno
upisanih 750€ u "Učešće u šteti" polje** - podudaranje s totalom bilo je
namjerni odabir testne vrijednosti, ne kod-bug. Nikakva promjena koda nije
napravljena za ovu točku.

**Verifikacija.** `tsc --noEmit` čisto na sva tri paketa, `next build`
prošao. Nema schema promjena u ovom nastavku (nije trebala migracija).
Scratch `.ts` testovi (izravno protiv produkcije, `npx tsx`): (a) pravi
4-tjedni weekly ugovor kreiran → potvrđeno da "neplaćeno" filter ispravno
suzuje na 1 tekući period; (b) `renderTermsPdf` pozvan izravno s test
potpisom → potpis vizualno potvrđen na generiranom PDF-u. Test podaci i
scratch skripte obrisani nakon verifikacije, `.env` u `packages/api/`
uklonjen. Puni login-flow UI test PRESKOČEN - isto poznato PKCE
ograničenje kao prošla četiri nastavka.

---

**Zadnje ažurirano:** 2026-08-26, tridesetpeti nastavak - praćenje plaćanja
najma (RentPayment) za weekly/monthly ugovore, uklj. "Najmovi" stranicu,
notifikacije vlasniku (dospijeće + petkov standing podsjetnik) i email
upozorenje klijentu za dospjelu neplaćenu naplatu.

**0) Provjera "učešće" polja.** `Contract.excessAmount` ("Učešće u šteti")
je franšiza/osigurateljni izraz, NE depozit - potvrđeno prije dodavanja
novog polja. Dodano `Contract.depositAmount` (nullable) kao odvojeno polje,
labelirano "Depozit / učešće" u formi/PDF-u da se vizualno razlikuje od
"Učešće u šteti".

**1) `Contract.paymentFrequency`** (enum daily/weekly/monthly, default
daily - postojeći ugovori nepromijenjeni). weekly/monthly: `pricePerDay`
(isto polje, drugo značenje - nije preimenovano da se ne dira PDF/ostatak
koda) predstavlja cijenu PO PERIODU. Forma (web+mobile) jasno označava to
tekstom kad učestalost nije "daily", i mijenja label polja ("Cijena/tjedan"/
"Cijena/mjesec").

**2) `RentPayment` model + generacija.** `buildRentPaymentPeriods`
(`server/rentPayments.ts`) dijeli `[dateFrom, dateTo]` na periode fiksne
duljine (7/30 dana - isti "monthly=30" pojednostavljeni pristup kao
`vehicleCosts.ts` pro-rata), zadnji period se odsijeca na `dateTo` bez
pro-rata umanjenja iznosa (puna cijena po periodu čak i za skraćeni zadnji
period - korisnikov zahtjev nije tražio pro-rata). `dueDate = periodStart`.
`createRentPaymentsForContract` se poziva ODMAH pri kreiranju ugovora
(`createContractAndSendSigningEmail`, ne tek nakon potpisa - dateFrom/
dateTo/pricePerDay su već finalizirani u tom trenutku, isti razlog kao
ostala PDF polja). `extendRentPaymentsForContract` se poziva iz
`completeAnnexSigning` (postojeći renewal/anex flow - provjeren PRIJE
implementacije, kako je korisnik tražio) - generira periode SAMO za
produljeni dio (stari `dateTo`+1 dan do novi `dateTo`), nastavljajući
raspored. `closeContractEarly` sad i BRIŠE (ne samo "poništava") RentPayment
retke čiji je `periodStart` nakon `actualEndDate` - NEKONDICIONALNO (čak i
ako su već označeni plaćenima - "nisu se dogodili" je apsolutan kriterij po
korisnikovom izričaju), verificirano scratch testom da ovo stvarno vrijedi
i za plaćeni budući period.

**3) "Najmovi" stranica** (`/najmovi` web, `owner/najmovi.tsx` mobile) -
tablica/lista SVIH RentPayment redaka (svi ugovori/klijenti), redak =
klijent s gumbom "Plaćeno" (jedan klik, `paid=true`+`paidAt=sada`, bez
forme). Filter neplaćeno/plaćeno/sve (default neplaćeno), "Ukupno
neplaćeno" zbroj na vrhu. Nova `GET /api/rent-payments` (bilo koji
ulogirani owner/employee) + `POST /api/rent-payments/[id]/mark-paid`
(gated na `invoicing` modul - postojeći permission modul, nije trebalo
novi).

**4) Notifikacije - `runRentPaymentChecks`** (`server/rentPayments.ts`),
dodan u ISTI `/api/cron/check-registrations` request kao ostali dnevni
checkovi (namjerno, isti razlog kao svaki put - Vercel cron plan limit).
Owner "dospijeva danas" (dueDate=danas, neplaćeno) - dedupe preko novog
`ownerDueNotifiedAt` polja (isti `*NotifiedAt` obrazac kao
`incompleteDataNotifiedAt`). Petkov standing podsjetnik (dan u tjednu = 5)
- BEZ dedupe polja (namjerno - niskorizična, informativna notifikacija,
slučajni dupli re-run istog petka nije štetan, ne opravdava dodatnu shemu
kolonu).

**5) Email upozorenje klijentu** - `sendRentPaymentOverdueEmail`, šalje se
TOČNO 1 dan nakon `dueDate` (isti "milestone-dan" obrazac kao
`registrationReminders.ts`, samo "poslije" umjesto "prije" - u repou nije
postojao gotov "X dana nakon" obrazac za izravno kopiranje, pa je 1-dan
razmak korisnikova pretpostavka primijenjena bez daljnjeg dogovaranja jer
nije bilo suprotnog signala). Dedupe preko `clientOverdueNotifiedAt`.

**6) PDF ispravak.** `ContractPdf.tsx` je prije množio `pricePerDay × broj
DANA` za "Ukupno" - za weekly/monthly bi to dalo apsurdno velik iznos
(cijena/tjedan × broj dana umjesto broj tjedana). Popravljeno da množi s
brojem PERIODA (ista 7/30-dana logika kao generacija), label polja
("Cijena/dan/tjedan/mjesec") i "Depozit / učešće" red dodani na PDF.

**7) Mobile paritet.** `owner/najmovi.tsx` (lista + filter chipovi + isti
"Plaćeno" gumb), `owner/contracts/new.tsx` dobio isti
frequency-chip-selector + dinamički price label + depositAmount polje,
`lib/api.ts` proširen s `PaymentFrequency`/`RentPaymentDTO`/
`listRentPayments`/`markRentPaymentPaid`. Nav gumb na `owner/home.tsx`.

**Verifikacija.** `tsc --noEmit` čisto na sva tri paketa. `next build`
prošao (jedna ESLint greška usput uhvaćena i popravljena - neescapean navodnik
u JSX tekstu, `react/no-unescaped-entities`). Migracija
`20260826200000_add_rent_payment_tracking` (novi enum, dva nova Contract
stupca, nova `rent_payments` tablica) primijenjena na produkciju nakon
eksplicitne korisnikove potvrde. **Pun lifecycle end-to-end test protiv
produkcijske baze** (scratch `.ts` + `npx tsx`, efemeran test vozilo/
klijent obrisan nakon): kreiran pravi 3-tjedni weekly ugovor kroz
`createContractAndSendSigningEmail` (poslao i stvaran signing email) → 3
perioda generirana s točnim datumima/iznosom (100€ svaki); owner
"dospijeva danas" email poslan + potvrđen dedupe na ponovnom pozivu;
klijent "dospjelo jučer" email poslan + potvrđen dedupe; treći period
označen plaćenim → `listRentPayments`/unpaid filter ispravno odražavaju
promjenu; ugovor prijevremeno zatvoren (usred drugog perioda) → treći
(budući, već OZNAČEN plaćenim) period ispravno OBRISAN, prva dva ostala.
Usput uhvaćena i ispravljena greška u samom test scriptu (prvi pokušaj
zatvaranja pukao na `contract_not_closable` jer testni ugovor nikad nije
prošao pravi signing flow pa mu je status ostao "sent" - popravljeno ručnim
postavljanjem statusa na "signed" prije `closeContractEarly` poziva, isti
"scratch skripta zaobilazi HTTP/signing sloj" obrazac kao ostatak testa).
Sve provjere prošle nakon fixa. Test podaci i scratch skripte obrisani,
`.env` u `packages/api/` uklonjen. Puni login-flow UI test (vizualna
provjera "Najmovi" stranice/forme) PRESKOČEN - isto poznato PKCE
ograničenje kao prošla tri nastavka.

---

**Zadnje ažurirano:** 2026-08-26, tridesetčetvrti nastavak - dva mala
dodatka na servisnu knjižicu iz prošlog nastavka: "Danas" prečac za datum,
i dobavljač dijelova + autocomplete "memorija" za servis/dobavljač.

**1) "Danas" gumb kraj datuma.** Web: mali `<button>` kraj `<input
type=date>` koji zove postojeći modul-level `todayIsoDate()` helper
(već je postojao za statistiku raspon, samo ponovno iskorišten). Mobile:
`Field` komponenta dobila opcionalan `onTodayPress` prop (ne dira ostale
pozive Field-a u fajlu koji ga ne prosljeđuju) - postavlja
`isoToHrDate(todayIsoDate())` u tekstualno DD.MM.GGGG. polje.

**2) Novo `ServiceRecord.partsSupplier` polje** (dobavljač DIJELOVA,
odvojeno od postojećeg `provider` koji sad znači isključivo "servis/
mehaničar koji je odradio rad") - migracija
`20260826180000_add_service_record_parts_supplier`, čisto aditivna
(jedan nullable stupac), primijenjena uz eksplicitnu potvrdu korisnika
(isto novo pravilo kao prošli nastavak). Pozicionirano u formi/tablici
odmah ispod "Cijena dijelova" (korisnikov eksplicitan zahtjev "ispod
cijene dijelova neka piše dobavljač"). Web tablica dobila stupac
"Dobavljač"; postojeći "Servis / dobavljač" label preimenovan u samo
"Servis" (razdvojeno značenje sad ima smisla - dobavljač ima svoje
polje).

**3) Autocomplete "memorija" za oba polja** (`provider` i `partsSupplier`)
- `getServiceRecordSuggestions()` (server/serviceRecords.ts) vraća distinct
prijašnje vrijednosti FLEET-WIDE (svi zapisi, ne po vozilu - "stalni
mehaničari/dobavljači" se tipično koriste za više vozila), poredano
najnovije-prvo. Nova ruta `GET /api/service-records/suggestions`
(top-level, ne vezana na vehicleId). Web: native `<datalist>` (ZERO novih
ovisnosti - CLAUDE.md pravilo "ne dodavati pakete bez pitanja", ovo je bio
ugrađen HTML mehanizam pa nije ni trebalo pitati). Mobile: RN nema native
datalist ekvivalent - `Field` komponenta dobila opcionalan `suggestions`
prop, prikazuje tap-to-fill chipove ispod polja (filtrirano prefiksom
trenutnog unosa, max 6), isti `styles.chip`/`chipText` koji već postoje u
fajlu (ništa novo stilizirano). Suggestions se re-fetch-aju nakon svakog
uspješnog dodavanja zapisa (novo ime mehaničara/dobavljača odmah dostupno
za sljedeći unos, ne tek nakon reloada stranice).

**Verifikacija.** `tsc --noEmit` čisto na sva tri paketa, `next build`
prošao (nova `/api/service-records/suggestions` ruta vidljiva u outputu).
End-to-end test izravno protiv produkcijske baze (isti `npx tsx` obrazac):
kreiran zapis s jedinstvenim (timestamp-suffiksiranim) `provider`/
`partsSupplier` vrijednostima → `getServiceRecordSuggestions()` ih
ODMAH vraća u listi (potvrđuje da se novi unos odmah pojavljuje kao
buduća sugestija, bez cache/dedupe kašnjenja). Test zapis obrisan nakon
verifikacije, `.env` u `packages/api/` uklonjen. Puni login-flow UI test
(vizualna provjera datalista/chipova, klik na "Danas") PRESKOČEN - isto
poznato PKCE ograničenje kao prošla dva nastavka.

---

**Zadnje ažurirano:** 2026-08-26, tridesettreći nastavak - servisna knjižica
(`ServiceRecord`) proširena: trošak razdvojen na dijelove+rad, uz legacy
fallback za stare zapise, provučeno kroz cijeli statistički lanac.

**1) Shema.** `ServiceRecord.cost` postao `Float?` (LEGACY - nikad se više ne
piše za nove zapise, ostaje na starim retcima radi povijesti). Dodana dva
nova nullable polja `partsCost`/`laborCost`. `description` NIJE preimenovano
niti duplicirano - već je postojalo i semantički pokriva "razlog", samo
relabelano u UI-u (isti pristup kao `Client.address`/`driverLicenseKey`
presedan iz ranijih nastavaka - ne dodavati polje ako postojeće već znači
isto). Migracija `20260826150000_split_service_record_cost` - ručno
napisana (isti razlog kao sve ostale), primijenjena **uz eksplicitnu
potvrdu korisnika prije pokretanja** (novo pravilo, vidi CLAUDE.md - prvi put
formalno primijenjeno).

**2) `serviceRecordTotal()` helper** (`server/serviceRecords.ts`, exportan) -
jedino mjesto koje zna fallback logiku: `partsCost ?? 0 + laborCost ?? 0`
AKO je barem jedno od ta dva postavljeno (signal "ovo je novi zapis" - novi
zapisi UVIJEK šalju oba polja, čak i kad je jedno 0, vidi
`serviceRecordCreateSchema`), INAČE `cost ?? 0` (stari zapis). `ServiceRecordDTO`
sad izlaže `partsCost`/`laborCost` (mogu biti `null` na starim zapisima) +
`total` (uvijek popunjen) - `cost` polje NIJE izloženo na DTO-u, frontend
nikad ne radi fallback matematiku sam.

**3) Provlačenje kroz statistiku.** `vehicleStats.ts` (`getVehicleStats`) -
select prošireno na `cost, partsCost, laborCost`, `serviceCost` agregacija
sad ide kroz `serviceRecordTotal()` umjesto direktno `r.cost`. Sve što se
na to naslanja (`statsTimeSeries.ts`, `periodicReports.ts`, dashboard graf,
`/vehicles/stats`, PDF izvještaj) NIJE trebalo dirati - svi konzumiraju već
agregiran `serviceCost` iz `getVehicleStats`/`getFleetStats`, popravljeno na
jednom mjestu.

**4) UI - web (`/vehicles/[id]`, "Servisna knjižica" tab).** Forma: "Trošak"
zamijenjen s "Cijena dijelova"/"Cijena rada" (oba opcionalna, defaultiraju
na "0" - prazan string se coerce-a u 0 kroz Zod, provjereno). "Opis
intervencije" label promijenjen u "Razlog" (isto polje, `serviceDescription`
state nije preimenovan). Tablica dobila stupce Dijelovi/Rad/Ukupno (stari
zapisi bez splita prikazuju "—" za dijelove/rad, ali ukupno je uvijek
popunjeno preko `total`). Vrh sekcije preimenovan u "Ukupno uloženo u
vozilo" (cijeli životni vijek zapisa za to vozilo, ne ograničeno na
period - `serviceRecords.reduce` preko svih učitanih zapisa).

**5) UI - mobile.** Isti state/forma split (`servicePartsCost`/
`serviceLaborCost`, oba default "0"), isti "Razlog" label, isti "Ukupno
uloženo u vozilo" naslov. Popis zapisa NIJE doslovna HTML tablica (RN nema
tu mogućnost) - isti postojeći `contractCard` stil kao ostatak fajla, samo
proširen prikazom "Dijelovi: X € · Rad: Y € · Ukupno: Z €" u retku (native
UI ekvivalent, ne WebView - vidi CLAUDE.md mobile paritet pravilo).

**Verifikacija.** `tsc --noEmit` čisto na sva tri paketa, `next build`
prošao. `prisma generate` pokrenut i prije i nakon `migrate deploy` (prije -
da typecheck vidi nova polja bez diranja baze; poslije - da client odgovara
stvarnoj shemi). End-to-end test **izravno protiv produkcijske baze**
(scratch `.ts` + `npx tsx`, isti obrazac kao prošli nastavak): (1) novi
zapis dijelovi=100/rad=50 → `total` 150 potvrđen, (2) legacy red kreiran
izravno kroz Prisma SAMO sa starim `cost`=80 poljem (bez `partsCost`/
`laborCost`) → DTO `total` ispravno fallback-a na 80, (3) `getVehicleStats`
za dan koji sadrži oba zapisa → `serviceCost` 230 (100+50+80), točan zbroj.
Sve tri provjere prošle. Puni login-flow UI test PRESKOČEN (isto poznato
PKCE ograničenje kao prošli nastavak). Test zapisi i scratch skripta
obrisani nakon verifikacije, `.env` u `packages/api/` uklonjen.

---

**Zadnje ažurirano:** 2026-08-26, tridesetdrugi nastavak - CSV bulk uvoz
klijenata, replicira ISTI obrazac kao postojeći CSV uvoz vozila (bug/modul iz
30. nastavka - `70ca2c4`).

**1) Shema - novi Client tekstualna polja + kompletnost tracking.**
`idNumber` (broj osobne, `@unique` - isti obrazac kao `Vehicle.vin`),
`driverLicenseNumber`, `birthDate` - sva tri nullable, popunjena ručno kroz
CSV ili ostaju null. `hasIncompleteData`/`incompleteReasons`/
`incompleteDataNotifiedAt` - identičan obrazac kao `Vehicle` (migracija
`20260824210000_add_vehicle_incomplete_data_tracking`), samo za Client.
Ručno napisana migracija (`20260826120000_add_client_csv_import_fields`) -
isti razlog kao svih prijašnjih (shadow-DB replay pada), `migrate deploy`
izravno na produkcijsku bazu - primijenjeno i verificirano.

**2) `importClientsFromCsvRows`** (`server/clients.ts`) - kopija
`importVehiclesFromCsvRows` strukture. OIB je jedino "hard stop" polje
(prazan → preskoči red, isti razlog kao registarska tablica kod vozila -
NOT NULL+UNIQUE, nema smislenog placeholdera). Pravi duplikati (OIB ILI
broj osobne već postoje na drugom klijentu, case-insensitive, provjereno i
unutar istog CSV-a preko `Set`) se preskaču. Sve ostalo nedostajuće
(ime/prezime/email/telefon/adresa/broj vozačke/datum rođenja) ili loše
formatirano (datum rođenja preko `parseHrDateToIso`) NE blokira uvoz -
klijent se uveze s placeholder vrijednostima gdje treba (NOT NULL polja) i
flagira u `incompleteReasons`. CSV uvoz namjerno NE dira dokumente (osobna/
vozačka slike) - postojeći `missingSlots` prikaz na `/clients/[id]`
(client-side, iz `CLIENT_DOCUMENT_SLOTS`) već pokriva tu odvojenu
kompletnost, nije dupliciran ovdje.

**3) Notifikacijski cron.** `runIncompleteClientDataCheck`
(`registrationReminders.ts`) - identičan `runIncompleteVehicleDataCheck`
obrazac (dedupe preko `incompleteDataNotifiedAt`, samo owner mail). Dodan u
ISTI `/api/cron/check-registrations` request kao vozila (namjerno nema
novog cron entryja u `vercel.json` - vidi 30. nastavak, Vercel plan limit
broja cron poslova). Response JSON ključ `incompleteData` preimenovan u
`incompleteVehicleData` (uz novi `incompleteClientData`) - provjereno da
nijedan frontend/test to ime ne čita, sigurna promjena.

**4) UI - web.** Nova `/clients/import` stranica (kopija `/vehicles/import`)
+ `/api/clients/import-csv` ruta. `/clients` lista dobila toolbar link +
⚠️ badge (isti `hasIncompleteData` tooltip obrazac kao `/vehicles`).
`/clients/[id]` dobio isti nepotpuni-podaci banner kao `/vehicles/[id]`, plus
prikaz tri nova polja (broj osobne/vozačke/datum rođenja) kad su prisutna.

**5) UI - mobile (owner-mobile).** Nov `owner/clients/import.tsx` ekran
(CSV preko `expo-document-picker`, upload preko postojećeg
`uploadPickedFile`/`File.upload()` mehanizma - isti razlog kao ostali
fajl-uploadi, RN FormData most ne podržava file partove izravno). Napomena:
vozila NEMAJU mobile CSV-import ekran uopće (nikad nije portan iz 30.
nastavka) - ovaj zadatak ga nije retroaktivno dodavao za vozila, samo
implementirao paritet za klijente kako je traženo. `owner/clients/index.tsx`
dobio nav gumb za import + ⚠️ badge s `incompleteReasons` tekstom.

**Verifikacija.** `tsc --noEmit` čisto na sva tri paketa (api/web/mobile),
`next build` prošao (nove rute `/clients/import` i `/api/clients/import-csv`
vidljive u outputu). Puni login-flow UI test PRESKOČEN (poznato PKCE
ograničenje magic-linka izvan pravog browsera, vidi 6. sekciju i bug #14) -
umjesto toga `importClientsFromCsvRows` testiran izravno kroz scratch
`.mjs`-ekvivalent (`npx tsx` + `.env` kopiran u `packages/api/`, isti
obrazac kao ostale scratch skripte) protiv STVARNE dev baze: 5 test redaka
(ispravan red, red bez broja osobne, pravi duplikat OIB-a unutar CSV-a, red
s nedostajućim poljima + neispravnim datumom, prazan red) → točan izvještaj
(2 uvezena od toga 1 nepotpun, 3 preskočena s točnim razlozima). Usput
otkriveno (NE bug) - test OIB `11111111111` se poklopio sa stvarnim
postojećim test klijentom "Proba Prroobba" iz 20.08. sesije, što je
POTVRDILO da duplicate-check ispravno radi (nije lažni pozitivan nalaz).
Test klijenti i scratch skripte obrisani nakon verifikacije, `.env` u
`packages/api/` uklonjen.

---

**Zadnje ažurirano:** 2026-08-25, tridesetprvi nastavak - korisnik zatražio
proširenje statistike vozila: dodatni troškovi (leasing/osiguranje/kasko/
ostalo, uklj. pro-rata rate), dashboard na početnoj stranici (web + mobile)
sa selektorom "sva vozila / jedno vozilo" i grafom kroz vrijeme. **Nadovezuje
se na, ne zamjenjuje, statistiku iz prošla dva nastavka** - `getVehicleStats`/
`getFleetStats` prošireni novim poljem, ne prepisani.

**Usput otkriven i istražen (NE popravljen kao "bug" - vidi zaključak)
lažni pozitivan nalaz tijekom verifikacije**: prvi prolaz debug-testa
pro-rata izračuna za ožujak 2026 nije se poklopio s ručno izračunatom
vrijednosti (za točno 1 dan/10 EUR). Istraženo prije zaključka da je kod
pogrešan - uzrok je **lokalna vremenska zona ovog Windows stroja
(Europe/Zagreb, DST prijelaz 29.03.2026. unutar test-raspona)** u
kombinaciji s `setHours(0,0,0,0)`-baziranom "dan" aritmetikom koja je
pretpostavljena svugdje u ovom repou (cron.ts, registrationReminders.ts,
sad i vehicleStats.ts/vehicleCosts.ts/statsTimeSeries.ts) - fiksna
86400000ms/dan konstanta se pomakne za ±1h preko DST granice. **Provjereno
da ovo NIJE produkcijski bug**: Vercel Node.js serverless funkcije rade s
`TZ=UTC` defaultom (nema custom TZ env vara ni lokalno ni u `vercel env ls
production`), UTC nema DST, pa je cijeli lanac (parsing `?from=` datuma +
`setHours` dan-aritmetika) samo-dosljedan u produkciji. **Potvrđeno
eksperimentalno, ne samo teorijom** - privremeno dodan `TZ=UTC` u lokalni
`apps/web/.env` (mičući lokalnu vremensku zonu iz jednadžbe, replicirajući
točno produkcijsko okruženje), isti test ponovljen → sve prošlo. `TZ=UTC`
red uklonjen nakon verifikacije (`git status` potvrđuje `.env` bez diffa -
taj fajl nije ni pod git kontrolom, ali provjereno da je vraćen na
izvorno stanje). **Spremljeno u trajnu memoriju**
(`project_dev_server_gotchas`) - buduće lokalno testiranje date-range
logike koja premošćuje DST granice (kraj ožujka/listopada) treba ili
birati raspone koji je izbjegavaju, ili privremeno postaviti `TZ=UTC`
prije testiranja, da se izbjegnu ovakvi lažni nalazi.

**1) Shema - `VehicleCost` model.** `costType` (novi enum
leasing/insurance/kasko/other - diskretne kategorije, za razliku od
`ServiceRecord.provider` koji je namjerno slobodan tekst; `other` nosi
`customType` za detalj). `amount` = iznos PO UČESTALOSTI za rate (npr.
mjesečna rata), ne ukupan iznos ugovora. `isInstallment` + (`installmentFrequency`
enum monthly/quarterly/yearly + `startDate` + opcionalan `endDate`, null =
"do daljnjega") ZA rate, ILI samo `date` za jednokratan trošak - app-level
invarijanta (ne DB constraint, isti "trust internal code" obrazac kao
svugdje u ovoj shemi).

**2) Pro-rata izračun (`server/vehicleCosts.ts` -
`calculateProRatedVehicleCosts`).** Jednokratan trošak - uključen SAMO ako
`date` upada u razdoblje (isti pristup kao `ServiceRecord.cost`). Rata -
`amount × (dana preklapanja / dana u jednom obračunskom razdoblju)` -
približne duljine (monthly=30/quarterly=91/yearly=365 dana, ista
pojednostavljena pretpostavka kao "monthly=30" u `periodicReports.ts` od
prošlog nastavka). `endDate` null ("do daljnjega") tretira se kao da rata
traje BAREM do kraja upitnog razdoblja. `getVehicleStats` (vehicleStats.ts)
prošireno - dohvaća `VehicleCost` retke, poziva ovu funkciju, `profit` sad
= `revenue - serviceCost - additionalCosts`. **Status pragovi ažurirani** -
"no_activity" sad zahtijeva NULA i servisnog I dodatnog troška (vozilo s
aktivnom ratom ali bez iznajmljivanja više NIJE "no_activity", nego "bad" -
i dalje aktivno troši novac).

**3) CRUD UI - novi "Dodatni troškovi" tab** na `/vehicles/[id]` (web) i
`owner/vehicles/[id].tsx` (mobile), uz postojeći "Servisna knjižica" tab
(korisnikov eksplicitan zahtjev "uz"). Forma s chip/select prekidačem
jednokratno-vs-rata koji otkriva odgovarajuća polja. Mobile koristi isti
DD.MM.GGGG. tekstualni datum obrazac kao ostatak fajla (nema native date
pickera nigdje u appu, dosljedno).

**4) Dashboard na početnoj stranici (web `(owner)/page.tsx`, mobile
`owner/home.tsx`).** Zamjenjuje prijašnji statični placeholder (web) /
plain nav-meni (mobile). Selektor "Sva vozila" (default) ili konkretno
vozilo - kad "sva vozila", poziva `getFleetStats` + prikazuje tablicu po
vozilu (sortirano po profitu, ISTA tablica koja je prije bila na
`/vehicles/stats`); kad jedno vozilo, poziva `getVehicleStats` za taj ID.
`/vehicles/stats` (stara ruta) sad SAMO redirecta na `/` (server-side
`redirect()`) - čuva stare linkove (uklj. link iz periodičnog email
izvještaja) bez dupliciranja UI-a. Web čita `?vehicleId=` iz
`window.location` (NE `next/navigation`-ov `useSearchParams()` - taj hook
zahtijeva Suspense boundary u Next 14 App Routeru, izbjegnuto direktnim
`window.location.search` čitanjem u `useEffect` jer je stranica već cijela
"use client") - vehicle-detail "Statistika" tab dobio gumb "Vidi na
dashboardu (s grafom)" koji linka na `/?vehicleId=X`.

**5) Graf kroz vrijeme - NOVA `server/statsTimeSeries.ts`
(`getStatsTimeSeries`).** Dijeli razdoblje na kalendarske mjesečne "kante"
(prva/zadnja odsječena na stvaran raspon), za svaku poziva
`getVehicleStats`/`getFleetStats` (ovisno je li vozilo odabrano) - isti
brojevi, samo raspoređeni po mjesecu. Nova `GET /api/stats/timeseries?
vehicleId=&from=&to=` ruta (`vehicleId` izostavljen = sva vozila).

**Graf - NAMJERNO bez chart biblioteke, na OBA platforme.** Provjereno
prije pisanja koda: ni `apps/web/package.json` ni `apps/mobile/package.json`
nemaju nijednu chart/graf biblioteku. Zahtjev je eksplicitno tražio pitanje
prije dodavanja nove mobile ovisnosti - **izbjegnuto u potpunosti** ručno
napisanim chartom umjesto pitanja: web koristi izvorni SVG (React ga
podržava bez ikakve biblioteke, `(owner)/StatsChart.tsx`), mobile koristi
plain `View` elemente s proporcionalnom visinom (`src/components/
StatsChart.tsx`, prvi shared component u mobile appu - `apps/mobile/src/
components/`, NE `app/owner/` direktorij, jer bi expo-router svaki fajl u
`app/` tretirao kao rutu). Mobile verzija je namjerno pojednostavljena
naspram web-a (nema "zero-line" podjele profit-iznad/trošak-ispod, obje
trake rastu od iste linije, predznak profita nosi samo boja) - manje
ekranskog prostora na mobitelu.

**6) Periodični izvještaj (email/PDF) prošli nastavak prošireni novim
poljem** - `additionalCosts` dodano u `PeriodicReportEmailVehicleRow`/
`ReportPdfVehicleRow` tipove, HTML tablicu, PDF tablicu i `totals` zbroj
(`periodicReports.ts`). `dashboardUrl` u periodičnom mailu promijenjen s
`/vehicles/stats` na `/` (novi kanonski dashboard).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(nove rute `/api/vehicles/[id]/costs`, `/api/vehicles/[id]/costs/[costId]`,
`/api/stats/timeseries` vidljive, `/` narastao s placeholdera na 2.39 kB,
`/vehicles/stats` smanjen na 158 B redirect stub). Migracija primijenjena
`prisma migrate deploy` izravno na produkciju (uz korisnikovu potvrdu).
**Stvaran end-to-end test protiv produkcijske baze** (privremena debug
ruta bez auth-a, `TZ=UTC` forsiran za vrijeme testa - vidi gore) - SVE
provjere prošle nakon TZ popravka: pro-rata rata za pun mjesec/pola
mjeseca/mjesec-bez-jednokratnog-troška/prije-početka-rate sve točne,
`endDate` cutoff točan, kvartalna rata pro-rata točna, profit ispravno
oduzima dodatne troškove, **fleet agregacija** (`getFleetStats` zbroj =
zbroj pojedinačnih `getVehicleStats` poziva) točna, **graf konzistentnost**
(zbroj mjesečnih kanti = jedan poziv preko cijelog raspona) točna i za
pojedino vozilo i za "sva vozila" (korisnikov eksplicitan test zahtjev
"provjeri da graf i brojevi ostaju konzistentni"). **Usput uhvaćena i
popravljena vlastita greška u SAMOM TESTU** (ne u produkcijskom kodu) -
prva verzija `d2_fleetChartConsistency` provjere je uspoređivala 3-mjesečni
graf zbroj s 1-mjesečnim (ožujak) fleet zbrojem, lažno pao; popravljeno da
oba računaju preko istog Q1 raspona. Test podaci (2 vozila, 3 troška)
obrisani u `finally` bloku, eksplicitno potvrđeno upitom nad produkcijskom
bazom (oba brojača `0`). Debug ruta uklonjena (`git status` potvrđuje čist
diff). **"Mobile prikazuje identične brojeve kao web" nije zasebno
testirano na uređaju** (nema simulator/uređaj u ovom okruženju) - ali
strukturno zajamčeno konstrukcijom: mobile poziva ISTE `/api/vehicles/[id]/
stats`, `/api/vehicles/stats`, `/api/stats/timeseries` rute kao web, isti
DTO oblik, ista (upravo testirana) backend logika - nema odvojene mobile
implementacije brojki koja bi mogla divergirati.

---

**Prijašnji dio (trideseti nastavak)** - korisnik zatražio
periodične izvještaje o profitabilnosti flote (automatski mail + on-demand
PDF), nadovezano na dashboard iz prethodna dva nastavka. Web dio odrađen
prvo, zatim mobile parity nakon korisnikove eksplicitne potvrde (pitan zbog
većeg prethodnog gapa - vidi točku 7 niže). **Usput, između web i mobile
dijela ove sesije, stigla je poruka koja je izgledala kao velik novi zahtjev
("Proširi/zamijeni statistiku vozila...") koju je korisnik odmah zatim
eksplicitno demantirao ("nisam ti ovaj prompt naljepio") - tretirano kao
NE-instrukcija dok korisnik nije naknadno potvrdio da je ipak želi
primijenjenu, TEK nakon dovršetka ovog nastavka** (vidi sljedeći nastavak).

**1) Shema.** `CompanySettings` (singleton) dobio `reportFrequency`
(novi enum `off|daily|weekly|monthly|custom`, default `off` - postojeći
produkcijski račun ne počinje neočekivano primati automatske mailove dok
vlasnik sam ne uključi u `/settings`), `reportCustomIntervalDays` (nullable
Int, koristi se samo za "custom"), `reportEmailEnabled` (default `true` -
korisnikov eksplicitan default), `lastReportSentAt` (dedupe timestamp, isti
obrazac kao `registrationReminder*SentAt`). **"Svaki owner account ima svoj
interval" iz zahtjeva NIJE implementirano doslovno** - app je single-tenant
(JEDAN CompanySettings red, dokumentirano od prije), pa to kolabira na "taj
jedan red ima svoj interval", bez iteracije po ownerima - točno kako i
zahtjev sam kaže u točki 1 ("spremi u Settings/CompanySettings model").
Interval se tretira kao "dana od zadnjeg slanja" (`daily=1/weekly=7/
monthly=30/custom=N`), NE kalendarski dan/tjedan/mjesec - jednostavnije i
dosljedno s "custom N dana" opcijom.

**2) `server/periodicReports.ts` (novo).** `getReportIntervalDays`/
`isReportDue` - čisti izračun bez efekata, lako testiran izravno (vidi
verifikacija niže). `buildFleetReportData(from,to)` - **ISTI brojevi kao
dashboard** (`getFleetStats` iz prošlog nastavka, nedirano), samo spojeno s
vehicle labelama + fleet-wide zbrojevima; koristi ga i automatski mail i
on-demand PDF (jedan izvor podataka, dva izlaza). `runPeriodicReportCheck()`
- cron entry point: `off` → ništa; `custom` bez postavljenog broja dana →
ništa (nepotpuna konfiguracija); `reportEmailEnabled: false` → ništa BEZ
diranja `lastReportSentAt` (nema drugog automatiziranog artefakta osim
maila - in-app dostupnost već postoji kroz `/vehicles/stats` bilo kad -
kad vlasnik kasnije uključi mail, dužni izvještaj odmah krene sljedećim
cron pokretanjem); inače provjeri `isReportDue`, ako da - pošalje mail i
ažurira `lastReportSentAt`.

**3) "Dana na servisu" u izvještaju - NIJE implementirano kao poseban
brojač, namjerna odluka.** Zahtjev traži "dani iznajmljeno/slobodno/na
servisu", ali `Vehicle.underService` je čist CURRENT boolean toggle bez
povijesti (nikad nije bilježio KADA je uključen/isključen - vidi
schema.prisma) - retroaktivno "koliko dana je vozilo bilo na servisu U
PROŠLOM razdoblju" NIJE izračunljivo iz postojećih podataka, samo trenutno
stanje. Kako "isti brojevi kao dashboard" iz zahtjeva izravno upućuje na
`getFleetStats` (koji već postoji i NE prati taj povijesni brojač ni na
dashboardu), izvještaj namjerno prikazuje isto što dashboard već prikazuje:
`rentedDays`/`freeDays`/`totalDays` (mjerljivo, povijesno točno) + `status`
(good/ok/bad/no_activity, ISTI dashboard indikator, uklj. trenutno
`on_service` stanje kroz postojeći computed Vehicle.status). Dodavanje
prave povijesne "servis-period" evidencije bio bi novi, veći data-model
zahvat (zasebna vremenska evidencija odvojena od `ServiceRecord`, koji
bilježi POJEDINAČNE troškove/intervencije, ne raspone nedostupnosti) -
izvan opsega ovog zahtjeva, spomenuto korisniku u sažetku sesije.

**4) Email (`lib/email.ts` - `sendPeriodicReportEmail`).** NAMJERNO bez
grafa/slike - repo nema chart/image-generation biblioteku, a inline
grafovi u emailu su notorno nepouzdani kroz email klijente - HTML tablica
(brojevi po vozilu, sortirano po profitu) + link na
`{NEXT_PUBLIC_OWNER_APP_URL}/vehicles/stats` za vizualni dashboard prikaz -
točno fallback koji je zahtjev eksplicitno dopustio ("inače samo brojevi +
link"). `NEXT_PUBLIC_OWNER_APP_URL` je već postojeći, DEFINIRAN ALI DOSAD
NEKORIŠTEN env var u produkciji (provjeren `vercel env ls production` prije
korištenja, ne nagađanjem) - prvi put stvarno iskorišten ovaj nastavak.

**5) Cron.** Dodano u ISTI `/api/cron/check-registrations` request kao
registracijski/nepotpuni-podaci checkovi (treći `Promise.all` element) -
namjerno BEZ novog Vercel cron entryja (isti razlog kao servisna knjižica/
CSV notifikacija ranije - rizik od probijanja plan limita).

**6) On-demand PDF export (`ReportPdf.tsx` + `generateReportPdfBuffer` +
`GET /api/reports/pdf?from=&to=`).** Gumb "Preuzmi PDF izvještaj" dodan na
`/vehicles/stats` (koristi VEĆ postojeći date-range selektor s tog dashboarda
- "in-app prikaz" iz zahtjeva je time već pokriven POSTOJEĆOM stranicom iz
prošlog nastavka, nije trebala nova stranica, samo PDF-export nadogradnja).
**PDF se NE sprema na Hetzner** - generira se u letu i streama izravno kao
download (`Content-Disposition: attachment`) - prvi put u ovom repou da
generirani PDF NIJE trajno spremljen prije slanja (svi dosadašnji PDF-ovi -
ugovor/zapisnik/aneks/uvjeti - vežu se uz trajan zapis kao "dokaz", ovaj je
ephemeralan/parametriziran po pozivu, nema smisla trajno čuvati svaku
kombinaciju datuma). Nova `styles.table*` pravila u `pdf/styles.ts`
(prošireno, ne zamijenjeno - ostali PDF-ovi nedirani).

**Usput uhvaćena i popravljena vlastita greška prije verifikacije:**
`next build` je pukao (ESLint `react/no-unescaped-entities`) na doslovnim
`"` navodnicima u JSX tekstu unutar `PeriodicReportsSection.tsx` -
`tsc --noEmit` to ne hvata (ESLint je zaseban build korak), uhvaćeno tek na
punom `next build` provjeri prije nego je proglašeno gotovim - popravljeno
HTML entitetima (`&ldquo;`/`&rdquo;`).

**7) Mobile parity - PUNA (korisnik eksplicitno odabrao "settings + PDF"
opciju** kad pitan, zbog većeg pre-postojećeg gapa: owner-mobile prije ovog
nastavka NIJE imao NIKAKVU Settings stranicu, ni ovu ni postojeću tvrtka/
T&C - taj širi gap i dalje ostaje (T&C/logo/company-info NISU portani,
izvan opsega, samo periodični izvještaji).

**Nova ovisnost `expo-sharing@~57.0.15`** - jedina nova native ovisnost u
ovom nastavku, dodana `npx expo install expo-sharing` (Expo je sam odabrao
točnu SDK-57-kompatibilnu verziju). Instalacija je prvo pukla
(`ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`) jer gola `pnpm add` ne prosljeđuje
projektov custom `virtual-store-dir=C:/v` (vidi
`project_dev_server_gotchas` memoriju) - popravljeno ručnim dodavanjem u
`package.json` + `pnpm install --virtual-store-dir "C:/v"` s root razine.
**expo-sharing NIJE registriran u `app.json` plugins nizu** - provjeren
njegov config-plugin `.d.ts` prije odluke (ne nagađanjem): plugin postoji
samo za iOS Share Extension (PRIMANJE shareova U app), ne za odlazni
`shareAsync()` koji ovaj zahtjev koristi - nepotreban za ovaj use-case.

**`downloadReportPdf` (`src/lib/api.ts`)** - koristi `File.downloadFileAsync`
(izvorna podrška za custom headers, provjereno u `expo-file-system` 57.0.2
`.d.ts` prije korištenja) s Bearer tokenom, sprema u `Paths.cache`,
`idempotent: true` (isti raspon = isti filename = prepiše, ne baci grešku).
Vraćeni `File.uri` se prosljeđuje u `Sharing.shareAsync()` na
`/vehicles/stats` mobile ekranu (novi "Preuzmi PDF izvještaj" gumb) - otvara
OS share sheet (spremi/pošalji dalje), s `Alert.alert` fallbackom ako
`Sharing.isAvailableAsync()` vrati `false`.

**Novi `owner/settings.tsx` ekran (prvi ikad u ovom mobile appu)** - SAMO
periodični izvještaji sekcija (učestalost kao chip-preseti, custom-dana
tekstualno polje, email-toggle kao chip, isti obrazac kao "na servisu"
checkbox-zamjena iz servisne knjižice), NE cijeli Settings paritet (tvrtka/
logo/T&C ostaju web-only, izvan opsega OVOG zahtjeva). Link dodan na
`owner/home.tsx` glavni izbornik. Nema permission-gating UI-a (mobile nema
koncept employee permisija uopće - `resolveMobileRole` sve owner-app
korisnike vraća kao `role:"owner"`, isti obrazac kao ostatak mobile appa -
backend `requireModulePermission("settings")` i dalje štiti stvaran zapis,
neovlašten employee bi dobio 403 prikazan kao greška).

**NIJE testirano na fizičkom uređaju/simulatoru - VAŽNIJE upozorenje nego
inače.** Za razliku od ranijih mobile-port nastavaka (koji su reuse-ali
postojeće, već native-linked pakete), ovaj put je dodana STVARNO NOVA
native ovisnost - postojeći build dev-clienta na korisnikovom uređaju NEMA
`expo-sharing` native modul kompajliran u sebe, pa PDF-share gumb NEĆE
raditi dok se dev client ne rebuilda (`eas build --profile development` ili
`expo run:android`/`expo run:ios`) - obični Metro/JS reload NIJE dovoljan za
nove native module. S obzirom na poznatu krhkost lokalnog Android native
builda na ovom Windows stroju (vidi `project_dev_server_gotchas`), EAS
cloud build preporučen umjesto lokalnog `expo run:android`.

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
NAKON popravka lint greške (nova ruta `/api/reports/pdf` vidljiva).
Migracija primijenjena `prisma migrate deploy` izravno na produkciju (uz
korisnikovu potvrdu). **Stvaran end-to-end test protiv produkcijske baze**
(privremena debug ruta bez auth-a, bez `_` prefiksa): pragovi
(`getReportIntervalDays`/`isReportDue`) testirani izravno kao čiste funkcije
(off→null, daily/weekly/monthly→1/7/30, custom bez broja→null, custom
14→14; never-sent→due, sent-today→not-due, sent-6-dana-prije-tjedni→not-due,
sent-7-dana-prije→due). **READ-ONLY protiv stvarnih produkcijskih podataka**
(korisnikov eksplicitan zahtjev) - `buildFleetReportData` za zadnjih 7 dana
na 4 stvarna vozila, zbroj prihoda/troška servisa/profita NEOVISNO ručno
izračunat i uspoređen - TOČNO se poklapa. PDF generacija testirana na
istom razdoblju - stvaran buffer, potvrđeno `%PDF` header. Settings
round-trip testiran (spremljeno custom/10/false, potvrđeno vraćeno točno
to), **originalne vrijednosti vraćene u `finally` bloku i eksplicitno
potvrđene upitom nad produkcijskom bazom** (natrag na `off`/`null`/`true`/
`null` - stanje prije testa). **NIJE pozvan `runPeriodicReportCheck()`
izravno** (namjerno - poslao bi stvaran mail na produkcijski `OWNER_EMAIL`,
isti razlog kao ranije u ovom logu za slične testove) - njegove sastavne
funkcije testirane su odvojeno gore, dovoljno da pokriju logiku bez
sporednog efekta slanja pravog maila. Debug ruta uklonjena (`git status`
potvrđuje čist diff). Nije testirano kroz pravi owner login klik u
browseru niti kroz stvaran cron poziv s `CRON_SECRET`-om - isti razlog kao
svugdje ranije u ovom logu.

---

**Prijašnji dio (dvadesetdeveti nastavak)** - korisnik zatražio
("odradi i na mobitelu") portanje Servisne knjižice na owner-mobile - poznat
gap eksplicitno flaggan u prošlom nastavku (mobile "Servis" tab je i dalje
pokazivao "uskoro" placeholder, puna funkcionalnost postojala je samo na
webu). Zatvara zadnji preostali web-only owner-facing gap pod novom
paritetnom politikom ([[feedback_mobile_web_parity]]).

**Novo u `src/lib/api.ts` - podrška za "forma + opcionalan upload u jednom
requestu" preko `expo-file-system`-a.** Web-ova `POST /api/vehicles/[id]/
service-records` ruta prima multipart/form-data s text poljima
(datum/opis/trošak/servis) I opcionalnim `receipt` file poljem u ISTOM
requestu - postojeći `uploadPickedFile` helper (koristi `File.upload()` iz
`expo-file-system`, izbjegava poznat "Unsupported FormDataPart
implementation" Android bug za file partove) je prije slao SAMO jedan file
part, bez načina da priloži dodatna text polja. **Pronađen i iskorišten
službeni `parameters?: Record<string,string>` parametar** u
`UploadOptions` tipu (`expo-file-system` 57.0.2, provjeren izravno u
paketovim `.d.ts` fajlovima prije korištenja, ne nagađanjem - AGENTS.md u
`apps/mobile` eksplicitno traži provjeru točnih verzioniranih API-ja prije
pisanja koda) - dodaje text polja UZ file part u isti multipart body,
izvorna native podrška, bez ručnog sastavljanja multipart tijela.
`uploadPickedFile` proširen 4. opcionalnim argumentom (`parameters`) -
NEOVISNO postojeća 3 poziva (registration-doc/insurance-policy) rade
identično kao prije (default `undefined`).

**Dva puta za kreiranje ovisno o postojanju računa:** `createServiceRecord`
(BEZ fajla) šalje običan `FormData` kroz postojeći `apiFetch` - safe jer
poznat Android bug pogađa isključivo FILE partove, ne text-only FormData
(potvrđeno čitanjem točnog opisa buga u postojećem komentaru prije
pretpostavke da će raditi). `createServiceRecordWithReceipt` (S fajlom)
koristi prošireni `uploadPickedFile` s `fieldName: "receipt"`.

**UI (`owner/vehicles/[id].tsx`, "Servis" tab - zamijenjen stari
placeholder).** 1:1 replika web sekcije: ukupan trošak na vrhu, forma
(datum kao DD.MM.GGGG. tekstualno polje + `parseHrDateToIso`, isti obrazac
kao "Datum isteka registracije" polje već u ovom fajlu - nema native date
pickera niti u ovom fajlu niti u statistici iz prošlog nastavka, dosljedno),
`DocumentPicker` za račun (isti `image/*`+`application/pdf` accept kao
prometna/polica), povijest intervencija ispod (datum/trošak/opis/servis/
link na račun/gumb za brisanje). **Checkbox "Vozilo je trenutno na
servisu"** - RN nema built-in checkbox i repo nema instaliran nijedan
checkbox paket, pa je implementiran kao toggle-ivi "chip" (isti UI
element koji ovaj fajl već koristi za marku/model/godinu/status-preset
odabire) s ✓ prefiksom kad je aktivan - vizualno različit od pravog
checkboxa ali funkcionalno identičan, bez nove ovisnosti. Prikazan SAMO
ako vozilo već nije na servisu (isto pravilo kao web). Isti "labava veza"
obrazac kao web - odvojen `updateVehicle` PATCH poziv NAKON uspješnog
kreiranja zapisa, ne atomski dio istog requesta.

**Usput uhvaćena i popravljena vlastita greška prije verifikacije:**
`handleDeleteServiceRecord` prve verzije nije imao `catch` blok (samo
`try/finally`) - neuspjelo brisanje bi tiho propalo bez ikakve povratne
informacije korisniku, nekonzistentno s VEĆ POSTOJEĆIM `handleCloseContract`
u istom fajlu (koji ima namjeran `catch` + dedicated `closeContractError`
state). Popravljeno dodavanjem istog obrasca (`serviceRecordError`, već
prikazan u UI-u ispod forme).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa. Backend logika
(`server/serviceRecords.ts`, API rute) je NEDIRANA i već izravno testirana
protiv produkcijske baze prije dva nastavka (7/7 provjera) - ovaj nastavak
je čisto UI+upload sloj koji poziva iste, već potvrđene rute, isti obrazac
verifikacije kao svaki prijašnji mobile-port nastavak (ne ponavlja
low-level test dijeljene logike koja nije mijenjana). **Nova
`parameters`-based multipart upload putanja (jedini stvarno nov mehanizam
ovaj nastavak) NIJE live-testirana** - zahtijeva stvaran fizički
uređaj/simulator (isti razlog kao svaki mobile nastavak, nema spojen
uređaj u ovom okruženju) - `.d.ts` provjera potvrđuje da API postoji i
ima očekivan oblik, ali stvaran multipart request na Android/iOS uređaju
nije proveden. **Ovo je jedini dio ove promjene koji korisnik treba
osobno provjeriti na uređaju prije nego se smatra potpuno gotovim**
(dodaj servisni zapis S računom, potvrdi da se stvarno uploada i
prikazuje).

---

**Prijašnji dio (dvadesetosmi nastavak)** - korisnik zatražio
statistiku/profitabilnost po vozilu na owner-mobileu (web dio već gotov u
prošlom nastavku) - **korisnik eksplicitno postavio novu trajnu politiku**:
"od sad mobile MORA imati sve mogućnosti kao web, ne dodavati ga naknadno
kao poseban korak". Spremljeno u trajnu memoriju
(`feedback_mobile_web_parity.md`) da se ubuduće owner-mobile implementira
ISTOVREMENO s owner-webom za owner-facing feature, ne kao odvojen naknadni
zahtjev (client-web/client-mobile scope ostaje nepromijenjen ovom politikom).

**Dijeljena logika ostaje isključivo u `@rent-a-car/api`** (`server/
vehicleStats.ts`, već postojao od prošlog nastavka, ništa nije diran) -
mobile poziva ISTE `GET /api/vehicles/[id]/stats` i `GET /api/vehicles/stats`
rute preko novih `getVehicleStats`/`getFleetStats` funkcija u `src/lib/
api.ts` (isti `apiFetch` obrazac kao sve ostalo, `from`/`to` kao
"YYYY-MM-DD" query parametri).

**Date-range selektor - NAMJERNO bez native date-pickera.** Zahtjev je
tražio "native picker", ali repo nema instaliran nijedan date-picker paket
(`@react-native-community/datetimepicker` i sl.) - dodavanje novog native
modula zahtijeva native rebuild koji se ne može testirati u ovom okruženju
(nema simulatora/uređaja, i poznat je krhak Android native build na ovom
Windows stroju, vidi `project_dev_server_gotchas`). Umjesto toga: brzi
"chip" preseti (7/30/90 dana, isti chip UI obrazac već korišten za
marku/model/godinu u ovom fajlu) + "Prilagodi" opcija koja otkriva
DD.MM.GGGG. tekstualna polja (identičan obrazac kao već postojeće "Datum
isteka registracije" polje u istom fajlu, `parseHrDateToIso`/`isoToHrDate`).
Ovo je svjestan kompromis - "native picker" bi bio ljepši UX, ali cijena
(nova native ovisnost, netestabilna ovdje) procijenjena preskupom za dobit.

**Web `/vehicles/[id]` "Statistika" tab i `/vehicles/stats` stranica
replicirani 1:1** - isti chip preset + custom raspon obrazac (mobile
ekvivalent web `<input type="date">`), isti brojevi (dana pod ugovorom/
slobodno, prihod, trošak servisa, profit), ista boja statusa
(good/ok/bad/no_activity), ista "sortirano po profitu opadajuće" tablica/
lista za cijelu flotu. Nova `apps/mobile/app/owner/vehicles/stats.tsx`
(FlatList, isti obrazac kao `vehicles/index.tsx`) - statička ruta ispravno
NE kolidira s dinamičkom `[id].tsx` (expo-router prioritizira statičke
segmente, već dokazano u ovom direktoriju kroz `new.tsx`). Gumb "Statistika
flote" dodan uz "+ Dodaj vozilo" na `vehicles/index.tsx`.

**Usput uhvaćena i ispravljena vlastita greška** - prva verzija nove
`vehicles/stats.tsx` datoteke koristila je `require("react-native")` unutar
komponente kao improviziran workaround jer je `TextInput` bio zaboravljen u
top-level importu - nekonzistentno s ESM-only konvencijom cijelog repoa
(nijedan drugi fajl ne koristi `require`). Uočeno prije verifikacije,
popravljeno dodavanjem `TextInput`-a u standardni `import` i uklanjanjem
wrapper funkcije.

**Namjerno NE dirano ovaj nastavak (postojeći, poznat gap, izvan traženog
scopea):** mobile "Servis" tab i dalje pokazuje "uskoro" placeholder -
puna Servisna knjižica (unos/lista/upload računa) implementirana je SAMO na
webu prije dva nastavka, mobile parity za TU značajku nije bio dio ovog
zahtjeva (koji je bio specifično scoped na statistiku). Spomenuto korisniku
u sažetku sesije - pod novom politikom paritetnosti ovo je sad eksplicitan
poznat dug, čeka potvrdu treba li se odraditi.

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa. Nije primijenjena
nova migracija (nije bilo potrebno - ništa novo u shemi ovaj nastavak).
Nije ponovljen end-to-end debug-ruta test protiv produkcijske baze - logika
izračuna (`vehicleStats.ts`) je već izravno testirana u prošlom nastavku i
nije mijenjana, ovaj nastavak je čisto UI sloj koji poziva već potvrđene
API rute preko već potvrđenog `apiFetch` mehanizma (isti obrazac koji svaki
prijašnji mobile-port nastavak koristi bez ponovnog low-level testiranja
dijeljene logike). Nije testirano na fizičkom uređaju/simulatoru - isti
razlog kao svaki prijašnji mobile nastavak (nema spojen simulator/uređaj u
ovom okruženju, Expo web target nije postavljen u projektu).

---

**Prijašnji dio (dvadesetsedmi nastavak)** - korisnik zatražio
statistiku/profitabilnost po vozilu. Nema nove Prisma sheme - sve se računa
iz postojećih `Contract`/`ServiceRecord` polja (bez migracije ovaj put).

**1) `server/vehicleStats.ts` - `getVehicleStats(vehicleId, from, to)`.**
Dana pod ugovorom = broj JEDINSTVENIH dana (Set, ne zbroj po ugovoru) koje
pokriva BILO KOJI `status: "signed"` ugovor tog vozila u razdoblju - dedupe
namjerno, da se preklapajući ugovori (blokirano na kreiranju od prošlog
nastavka, ali stariji podaci prije te blokade teoretski mogu postojati) ne
naduju iznad 100% iskorištenosti. **Stvaran kraj ugovora** =
`closedAt && actualEndDate ? actualEndDate : dateTo` - isti obrazac kao
computed Vehicle.status iz prošlog nastavka (`findCurrentContractForVehicle`),
ovdje primijenjen po danu umjesto "danas" trenutku.

**Prihod se NE računa iz dedupe-anog dana-seta** - namjerno po ugovoru
(`pricePerDay × dana koji upadaju u razdoblje`, zbrojeno preko svih
ugovora), jer svaki ugovor ima svoju cijenu; ako bi se dva ugovora povijesno
preklapala (rubni slučaj), prihod od oba se svejedno stvarno naplatio, pa
dedupe ovdje ne bi bio ispravan.

**Trošak servisa** = zbroj `ServiceRecord.cost` gdje `date` upada u
razdoblje (izravan upit, ne cijela povijest).

**Status pragovi (korisnikov eksplicitan "prvi pokušaj, može se kasnije fino
podesiti").** Zahtjev je naveo 4 riječi (zeleno/žuto/crveno/upozorenje) ali
konkretno definirao samo 3 pravila - protumačeno da je "upozorenje" 4.,
odvojeno stanje za rubni slučaj bez ijednog podatka: `no_activity` (nula
dana pod ugovorom I nula servisnog troška - vozilo bez ikakve aktivnosti u
razdoblju, ni dobro ni loše, samo "nema što prosuditi"), zatim `good`
(profit > 0 I iskorištenost > 60%), `ok` (profit > 0, niska iskorištenost),
`bad` (profit ≤ 0). **Ovo je čitanje koje bi korisnik trebao potvrditi ili
ispraviti** ako je "upozorenje" zapravo bilo mišljeno drugačije.

**2) API rute.** `GET /api/vehicles/[id]/stats?from=&to=` (jedno vozilo),
`GET /api/vehicles/stats?from=&to=` (cijela flota, `getFleetStats` - N upita
po vozilu, "flota je mala" obrazac kao svugdje). Oba `requireOwnerSession`
(read-only listing, isti obrazac kao ostale GET rute). Dijeljen
`apps/web/src/lib/parseStatsDateRange.ts` (from/to parsing + validacija,
default zadnjih 30 dana uklj. danas) - identična logika na oba mjesta,
vrijedilo dijeliti umjesto duplicirati u dvije route datoteke. Statička
`/api/vehicles/stats` route ispravno NE kolidira s dinamičkom
`/api/vehicles/[id]/...` (Next.js App Router prioritizira statičke segmente
- već dokazano u ovom repou kroz `/vehicles/import`/`/vehicles/new` koji
koegzistiraju s `/vehicles/[id]`).

**3) UI.** Novi "Statistika" tab na `/vehicles/[id]` (6. tab) - date-range
selektor (isti `<input type="date">` obrazac kao "Ugovori" tab), badge boja
+ brojevi (dana pod ugovorom/slobodno, prihod, trošak servisa, profit),
učitava se SAMO kad je tab stvarno aktivan (za razliku od contracts/service
koji se učitavaju odmah - ovaj ovisi o promjenjivom rasponu, nema smisla
pucati request prije nego ga korisnik pogleda). Nova `/vehicles/stats`
stranica (cijela flota) - isti date-range selektor, tablica SORTIRANA PO
PROFITU OPADAJUĆE (korisnikov eksplicitan zahtjev), spaja `/api/vehicles`
(marka/model/tablice) i `/api/vehicles/stats` (brojevi) po `vehicleId` na
klijentu - stats DTO namjerno ne nosi vehicle detalje, drži se fokusiran.
Link "Statistika flote" dodan u `/vehicles` toolbar (uz postojeći CSV uvoz
gumb), NE u glavni topnav (statistika je pod-pogled vozila, ne vlastita
top-level sekcija, isti rezon kao CSV import prije).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(nove rute `/api/vehicles/[id]/stats`, `/api/vehicles/stats`,
`/vehicles/stats` vidljive). **Stvaran dvodijelni test protiv produkcijske
baze** (privremena debug ruta bez auth-a, imenovana bez `_` prefiksa):
**Dio A - READ-ONLY protiv STVARNIH produkcijskih podataka** (korisnikov
eksplicitan zahtjev "uzmi vozilo sa stvarnim ugovorima... read-only, bez
izmjena") - nađeno prvo vozilo sa signed ugovorom (8 ugovora), NEOVISNO
ručno izračunat broj dana/prihod/trošak (namjerno odvojen kod od
`vehicleStats.ts`, ne poziva istu funkciju dvaput) uspoređen s
`getVehicleStats` rezultatom - sva tri broja (dana=14, prihod=0 - stariji
ugovori nemaju `pricePerDay`, trošak=0) TOČNO se poklapaju. **Dio B - status
pragovi** (fabricirani test podaci, obrisani nakon): `no_activity` za
vozilo bez ičega, `good` za 100% iskorištenost s pozitivnim profitom, `ok`
za 30% iskorištenost s pozitivnim profitom, zatim **na ISTOM vozilu** dodan
servisni trošak (1000 EUR) koji obrne profit u negativan → status se
ispravno promijenio `ok` → `bad` (točno korisnikov test scenarij "provjeri
da se boja mijenja kad promijeniš servisni trošak"), i poseban test za
prijevremeno zatvoren ugovor (`dateTo` daleko u budućnosti, `actualEndDate`
5 dana od početka) - `rentedDays`/`revenue` ispravno stali na
`actualEndDate` (5 dana, 250 EUR), NE nastavili do originalnog `dateTo`.
Test podaci (4 vozila, ugovori, 1 dijeljeni test klijent) obrisani u
`finally` bloku, **eksplicitno potvrđeno upitom nad produkcijskom bazom**
(sva tri brojača `0`). Debug ruta uklonjena (`git status` potvrđuje čist
diff). Nije testirano kroz pravi owner login klik u browseru (magic-link
auth) - isti razlog kao svugdje ranije u ovom logu.

---

**Prijašnji dio (dvadesetšesti nastavak)** - korisnik zatražio
punu servisnu knjižicu (web) - dosad je bio samo "uskoro" placeholder tab.

**1) Novi `ServiceRecord` model.** `vehicleId` (FK, `onDelete: Cascade` -
isti obrazac kao `VehicleImage`), `date`, `description`, `cost` (Float, EUR -
app nema multi-currency nigdje), `provider` (slobodan tekst - **namjerno NE
strukturirano/enum**, korisnik eksplicitno rekao da je AI kategorizacija
računa poseban budući zadatak), `receiptKey` (opcionalan S3 key, isti
`*Key`-na-frontend-nikad-raw obrazac kao ostali dokumenti). Migracija ručno
napisana (isti razlog kao prijašnjih deset nastavaka), primijenjena `prisma
migrate deploy` izravno na produkciju - **korisnik pitan za potvrdu prije
pokretanja**, odobreno.

**2) Server (`server/serviceRecords.ts`).** `listServiceRecordsForVehicle`
sortira po `date` opadajuće (**ne `createdAt`** - vlasnik unosi zapise
retroaktivno, npr. stari račun tjedan dana kasnije, pa je datum intervencije
relevantniji od trenutka unosa). `createServiceRecord`/`deleteServiceRecord`
(potonji briše i S3 račun ako postoji). **Ukupan trošak se NE računa
server-side** (nema agregatnog upita/polja na `VehicleDTO`) - lista je već
učitana za prikaz, klijent zbraja `reduce` nad istim nizom, isti "flota je
mala, ne paginira se" obrazac kao svugdje drugdje u appu.

**Usput uhvaćena i popravljena pre-postojeća rupa u `deleteVehicle`**
(`server/vehicles.ts`) - funkcija je već čistila S3 objekte za `images`/
`registrationDocKey`/`insurancePolicyKey` prije brisanja vozila, ali NIJE
znala za novi `serviceRecords` cascade (DB redci bi se sami obrisali FK
cascadeom, ali S3 računi bi ostali osiročeni, trajno nedostupni ali
zauzimaju prostor). Prošireno da prije brisanja vozila obriše i sve
`receiptKey` S3 objekte servisnih zapisa - isti obrazac kao već postojeći
`images` cleanup iznad.

**3) API rute.** `POST /api/vehicles/[id]/service-records` prima
`multipart/form-data` (ne JSON) - **jedan request za formu + opcionalan
upload** (isti server-side-buffer-upload obrazac kao `registration-doc`/
`insurance-policy` rute, ne presigned-URL obrazac koji signing wizard
koristi - fajl je malen, jedan po requestu). `serviceRecordCreateSchema.cost`
koristi `z.coerce.number()` (ne `z.number()`) upravo zbog ovoga - FormData
vrijednosti stižu kao string, coerce ih transparentno pretvara neovisno o
pozivatelju. `GET` (`requireOwnerSession`, isti "listing ostaje otvoren"
obrazac kao ostale vehicle/contract GET rute) i `DELETE .../[recordId]`
(`requireModulePermission(request, "vehicles")`).

**4) UI (`/vehicles/[id]`, "Servisna knjižica" tab - zamijenjen stari
placeholder).** Ukupan trošak istaknut na vrhu (`reduce` nad učitanom
listom, `.toFixed(2)` + "€"). Forma "Nova intervencija" (datum/opis/trošak/
servis/opcionalan file input za račun) iznad tablice povijesti (najnovije
prvo, s "pregledaj" linkom na račun ako postoji, "Obriši" po retku).
Servisni zapisi se učitavaju NEOVISNO o aktivnom tabu (isti obrazac kao
`contracts` - spreman čim se tab otvori, bez dodatnog loading treptaja).

**5) Vezano na "na servisu" toggle (korisnikov eksplicitan zahtjev da se
razmisli, ne obavezno vezati).** Checkbox "Vozilo je trenutno na servisu" u
formi za unos - **prikazan SAMO ako vozilo već nije na servisu**
(`vehicle.underService === false`, nema smisla nuditi toggle na već-uključeno
stanje). Nije dio `service-records` POST tijela - odvojen `PATCH
/api/vehicles/[id]` poziv NAKON uspješnog kreiranja zapisa (reuse postojeće
rute iz prošlog nastavka, isti mehanizam kao toggle gumb pored naslova),
poslan samo ako je checkbox stvarno označen. Namjerno labava veza (dvije
odvojene mutacije iza jednog klika), ne jedna atomична transakcija - servisni
zapis se svejedno sprema i ako drugi poziv iz nekog razloga padne, umjesto
da cijeli unos propadne zbog sporedne, ne-kritične radnje.

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa (nakon što je
`apps/web/.next` cache ponovno očišćen - isti poznati gotcha kao prošli
nastavak, referencirao je uklonjenu debug rutu), `next build` čist (nove
rute `/api/vehicles/[id]/service-records` + `/service-records/[recordId]`
vidljive). **Stvaran end-to-end test protiv produkcijske baze** (privremena
debug ruta bez auth-a, imenovana BEZ `_` prefiksa - naučeno prošli nastavak
da Next.js `_`-prefiksirani folderi tiho 404-aju): 7 provjera, sve prošle -
(1) `serviceRecordCreateSchema` parsira FormData string vrijednosti u pravi
`number` tip (`z.coerce` radi kako treba), (2) zapis s pravim uploadanim
računom (mala PNG, stvaran Hetzner upload) ima `receiptUrl`, (3) zapis bez
računa ispravno `null`, (4) lista vraća oba, sortirana najnovije-prvo,
zbroj troškova točan (523.45 = 123.45+400), (5) presigned `receiptUrl`
stvarno resolva (`fetch` vratio `200`), (6) `deleteServiceRecord` briše i S3
objekt (isti URL nakon toga `404`), (7) lista nakon brisanja ispravno ima
samo preostali zapis. Test podaci (1 vozilo, service recordi) obrisani u
`finally` bloku, **eksplicitno potvrđeno upitom nad produkcijskom bazom**
(`serviceRecord.count()` `0`, nema zaostalih `TestMake` vozila). Debug ruta
uklonjena (`git status` potvrđuje čist diff). Nije testirano kroz pravi
owner login klik u browseru (magic-link auth) - isti razlog kao svugdje
ranije u ovom logu.

---

**Prijašnji dio (dvadesetpeti nastavak)** - korisnik zatražio
prebacivanje prošlog nastavka (status vozila/prijevremeno zatvaranje/blokada
duplog ugovora) na owner-mobile (Expo). Čisto UI zadatak - backend je već
dijeljen kroz `@rent-a-car/api`, isti API pozivi kao web.

**1) `src/lib/api.ts` - popravljen zaostatak u ručno kopiranim DTO tipovima.**
Mobile NE importa `VehicleDTO`/`ContractListItem` iz `@rent-a-car/api/server`
(Node-only, vidi CLAUDE.md) - lokalne kopije oblika su drift-ale od
prijašnjeg nastavka. `VehicleDTO` dobio `underService`/`status`
(`VehicleStatus = "on_service" | "rented" | "available"`), `ContractListItem`
dobio `closedAt`/`actualEndDate`, `VehicleUpdateInput` dobio `underService?`.

**Nova `ApiError` klasa** (proširuje `Error`, nosi `status`+`body`) -
`apiFetch` je prije bacao goli `Error` s samo porukom, gubeći strukturirane
podatke iz JSON error bodyja. Potrebno za 409 `vehicle_has_active_contract`
response (nosi cijeli postojeći ugovor) - bez ovoga UI ne bi mogao ponuditi
izravan gumb za zatvaranje, samo generičku poruku. Backward-kompatibilno
(`err.message` i dalje radi identično za sve postojeće `catch` blokove).

**Nove funkcije:** `closeContract(id)` (POST `/api/contracts/[id]/close`,
isti endpoint kao web), `getVehicleActiveContract(vehicleId)` (GET
`/api/vehicles/[id]/active-contract`), `parseVehicleActiveContractConflict(err)`
(raspetlja 409 iz `createContract` u `ActiveContractSummary | null`, koristi
`ApiError` iznad).

**2) Status vozila.** `StatusBadge` komponenta (lokalna po ekranu, isti
obrazac kao web - nema zajedničkog components foldera u mobileu, ne uveden
jedan samo za ovo) na `owner/vehicles/index.tsx` (lista, badge pored naslova
retka) i `owner/vehicles/[id].tsx` (detalj, badge + gumb "Označi na servisu"/
"Vrati u pogon" pored naslova - `updateVehicle(id, {underService})`, reuse
postojeće rute).

**3) Prijevremeno zatvaranje.** Gumb na OBA mjesta (isto kao web): (a)
`owner/contracts/index.tsx` - `isActive()` helper proširen `!c.closedAt`
provjerom (isti propust koji je web imao prije prošlog nastavka - "Zatraži
slike" gumb bi se pogrešno prikazivao i za zatvorene ugovore unutar
originalnog `dateTo` raspona), nova "Zatvori ugovor" akcija + "Zatvoren
{datum}" prikaz nakon; (b) `owner/vehicles/[id].tsx` "Ugovori" tab - isti
`isContractActive` helper, gumb po kartici ugovora. Native `Alert.alert`
potvrda prije zatvaranja (RN nema `window.confirm` - isti UX namjera kao
web, gdje se `confirm()` koristio). Zatvaranje refresha i listu ugovora i
vozilo (`load()` + `loadContracts()`) da se status na vrhu odmah promijeni.

**4) Blokada duplog ugovora.** `owner/contracts/new.tsx`: `useEffect` na
promjenu `vehicleId` poziva `getVehicleActiveContract`, prikazuje amber
upozorenje (broj ugovora, klijent, datum do) s gumbom "Zatvori postojeći
ugovor" - identičan flow kao web. `canSubmit` dodatno zahtijeva
`!vehicleActiveContract`. Submit handler hvata 409 preko
`parseVehicleActiveContractConflict` kao safety net (isto kao web-ov 409
handler).

**Uhvaćena i ispravljena vlastita greška prije verifikacije:** prva verzija
`owner/vehicles/[id].tsx` je greškom vezala nove akcije (toggle servisa,
zatvaranje ugovora) na POSTOJEĆI page-level `error` state, koji ekran
koristi za `if (error || !vehicle) return <cijeli ekran samo s porukom>` -
neuspio toggle/close bi time zamijenio CIJELI detalj vozila (sve tabove,
podatke) golom porukom o grešci umjesto inline poruke pored gumba. Uočeno
review-om prije verifikacije (nema fizičkog uređaja za live test, vidi
niže), popravljeno odvojenim `serviceToggleError`/`closeContractError`
state-ovima, isti obrazac kao postojeći `docError`/`imagesError`/`infoError`
već u tom fajlu.

**Namjerno NE probano:** instalacija `react-native-web` radi Expo web
smoke-testa u Browser paneu - projekt ga nema (`expo start --web` odmah puca
s "missing react-native-web") i dodavanje samo radi mog testiranja bilo bi
nepotrebna, stvarna promjena ovisnosti izvan traženog scopea (mobile je
Expo, ne web app - vidi CLAUDE.md). `.claude/launch.json` je kratko dobio
pokusni `mobile-web` config za ovaj pokušaj, vraćen na izvorno stanje odmah
nakon što je pao (`git status` potvrđuje da launch.json nema diff).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa (nakon što je
`apps/web/.next` cache očišćen - referencirao je uklonjenu debug rutu iz
prošlog nastavka, netočna greška nepovezana sa stvarnim kodom). **Nije
testirano na fizičkom uređaju/simulatoru** - eksplicitno traženo u
zahtjevu, ali ovo okruženje nema spojen Android/iOS simulator ni Expo Go
uređaj, i Expo web target nije postavljen u projektu (vidi gore) - korisnik
treba sam pokrenuti `pnpm --filter @rent-a-car/mobile start` i skenirati QR
kod / pokrenuti simulator lokalno da potvrdi vizualno ponašanje prije nego
se smatra potpuno gotovim. Kod prati 1:1 već verificirani web referentni
flow (isti API pozivi, ista `findCurrentContractForVehicle`/
`closeContractEarly` backend logika testirana u prošlom nastavku) i
typecheck je čist, ali to NIJE isto što i potvrđen UI na uređaju.

---

**Prijašnji dio (dvadesetčetvrti nastavak)** - korisnik zatražio
status vozila (pod ugovorom/slobodno/na servisu), prijevremeno zatvaranje
ugovora, i blokadu duplog ugovora za isto vozilo. Sva tri dijela dijele ISTI
izvor istine za "vozilo ima tekući ugovor" - namjerno, da definicija ostane
dosljedna svugdje.

**1) Shema.** `Vehicle.underService` (boolean, default false) - ručni toggle,
NIJE izveden ni iz čega, vlasnik ga sam postavlja/miče. `Contract.closedAt` +
`Contract.actualEndDate` (oba nullable DateTime) - postavlja ih SAMO
`closeContractEarly()`. `dateTo` (originalno ugovoreni datum) OSTAJE netaknut
kao povijesni podatak - ništa ga ne prepisuje, `actualEndDate` bilježi kad je
najam STVARNO završio. `ContractStatus` enum NIJE dirian (nema novog "closed"
statusa) - "zatvoren" se izvodi iz `closedAt !== null`, ne iz statusa, jer
ugovor je i dalje stvarno bio "signed", samo je prijevremeno okončan.

**2) `findCurrentContractForVehicle(vehicleId)`** (novo, `server/contracts.ts`)
- JEDINI upit koji definira "vozilo ima tekući ugovor": `status: "signed"`,
`dateFrom <= danas <= dateTo`, `closedAt: null`. Koriste ga TRI mjesta: (a)
`toVehicleDTO` (`server/vehicles.ts`) za computed `status` polje na
`VehicleDTO` (`"on_service" | "rented" | "available"` - `underService`
nadjačava sve, provjerava se prvo da se izbjegne nepotreban DB upit), (b)
`createContractAndSendSigningEmail` baca novi `VehicleHasActiveContractError`
(nosi postojeći ugovor) ako vozilo već ima tekući ugovor - **stvarna
server-side blokada**, ne samo UI upozorenje koje se može zaobići izravnim
API pozivom, (c) nova `GET /api/vehicles/[id]/active-contract` ruta koju
`/contracts/new` poziva na promjenu odabranog vozila.

**3) `closeContractEarly(id)`** (novo, `server/contracts.ts`) - lagana
verzija bez foto/šteta koraka (eksplicitno traženo, puni "close contract"
flow s primopredajom je poseban budući zadatak). Odbija ugovore koji nisu
`"signed"` ili su već zatvoreni (`closedAt` postavljen) - baca
`contract_not_closable`. Nova `POST /api/contracts/[id]/close`
(`requireModulePermission(request, "contracts")`).

**4) Blokada duplog ugovora - UI flow.** `/contracts/new`: na promjenu
odabranog vozila, poziva `active-contract` rutu; ako vraća ugovor, prikazuje
amber upozorenje (broj ugovora, klijent, datum do) s gumbom "Zatvori
postojeći ugovor" (poziva close rutu izravno, bez napuštanja forme -
korisnikov eksplicitan zahtjev "umjesto da korisnik mora sam tražiti taj
ugovor") i onemogućuje submit dok upozorenje traje. Server-side POST
`/api/contracts` isto tako odbija (409, `vehicle_has_active_contract`) kao
safety net za race-uvjete/izravne API pozive - ruta hvata
`VehicleHasActiveContractError` i vraća podatke o postojećem ugovoru u JSON-u
(klijent, kod duplog pokušaja preko forme se time popuni isto upozorenje).

**5) UI - status prikaz i akcije.** `/vehicles` lista: novi "Status" stupac,
badge komponenta (zeleno/plavo/sivo za slobodno/pod ugovorom/na servisu).
`/vehicles/[id]`: isti badge pored naslova + gumb "Označi na servisu"/"Vrati
u pogon" (PATCH `/api/vehicles/[id]` s `{underService}`, reuse postojeće
rute/scheme - nije trebao novi endpoint). Postojeći "aktivan ugovor" banner
na istoj stranici proširen provjerom `!c.closedAt` (prije bi i zatvoren
ugovor unutar svog izvornog `dateTo` raspona i dalje lažno pokazivao kao
aktivan) + gumb "Zatvori ugovor prijevremeno" izravno u banneru. `/contracts`
lista: `isActive()` helper isto proširen `!c.closedAt` provjerom (isti
propust bi postojao za "Zatraži slike" gumb da nije popravljen), nova
"Zatvaranje" kolona (gumb dok je aktivan, "Zatvoren {datum}" nakon).

**Namjerno NE dirano:** mobile appovi (owner-mobile) - zahtjev nije spominjao
mobile, isti pristup kao raniji web-first nastavci gdje mobile prati kasnije
ako korisnik eksplicitno zatraži.

**Migracija** (ručno napisana, isti razlog kao prijašnjih osam nastavaka) -
`vehicles.underService` (boolean NOT NULL default false), `contracts.closedAt`
+ `contracts.actualEndDate` (oba nullable timestamp). Primijenjena `prisma
migrate deploy` izravno na produkcijsku bazu - **korisnik eksplicitno pitan
za potvrdu prije pokretanja** (auto-mode classifier je sam blokirao prvi
pokušaj kao promjenu produkcijske sheme), odobreno, migracija uspješno
primijenjena.

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(nove rute `/api/contracts/[id]/close`, `/api/vehicles/[id]/active-contract`
vidljive u outputu). **Stvaran end-to-end test protiv produkcijske baze**
(privremena debug ruta bez auth-a, isti obrazac kao prijašnjih osam
nastavaka - prva verzija stavljena u `api/_debug/...` je tiho vratila 404 jer
Next.js App Router tretira `_`-prefiksirane foldere kao private/izvan
routinga, preimenovano u `api/debug-vehicle-status-test` i radilo). Deset
koraka, svi prošli: (1) novo vozilo → `"available"`, (2) `underService: true`
→ `"on_service"`, (3) natrag `false` → `"available"`, (4) fabriciran
`"signed"` ugovor (jučer-sutra raspon, izravan `prisma.contract.create`,
zaobiđen pravi signing/email flow) → vozilo `"rented"`, (5)
`findCurrentContractForVehicle` pronalazi točno taj ugovor, (6) pokušaj
`createContractAndSendSigningEmail` za isto vozilo baca
`VehicleHasActiveContractError` s ispravnim `contract.id` (potvrđeno da se
NIKAD ne stigne do slanja mail-a - baca se prije `sendContractSigningEmail`
poziva, pa test nije poslao nikakav pravi email), (7) `closeContractEarly`
postavlja `closedAt`/`actualEndDate`, (8) vozilo natrag `"available"`, (9)
`findCurrentContractForVehicle` sad vraća `null`, (10) drugi poziv
`closeContractEarly` na isti (već zatvoren) ugovor ispravno baca. Test
podaci (1 vozilo, 1 klijent, 1 ugovor) obrisani u `finally` bloku bez obzira
na ishod - **eksplicitno potvrđeno upitom nad produkcijskom bazom da nema
ostatka** (`email: "test@example.com"` count `0`; usputno uočen NEPOVEZAN
pre-postojeći "Test Klijent" red iz sesije od 14.08. pod istim generičkim
imenom - nije moj test, provjereno po različitom OIB-u/emailu, namjerno
netaknut). Debug ruta uklonjena nakon verifikacije (`git status` potvrđuje
čist diff, samo namjeravane izmjene ostale). Nije testirano kroz pravi owner
login klik u browseru (magic-link auth) - isti razlog kao svugdje ranije u
ovom logu (trošak procijenjen prevelikim za ovu klasu promjene), oslonjeno na
tsc+build+izravno testiranu podatkovnu/business logiku iznad koju UI samo
tanko omata.

---

**Prijašnji dio (dvadesettreći nastavak)** - korisnik zatražio
bulk unos vozila putem CSV uploada. **Otkriven i riješen genuine konflikt u
zahtjevu prije implementacije** - detaljna numerirana specifikacija (sekcija
3) eksplicitno kaže "NIŠTA se ne preskače zbog nedostajućih/lošeg formata
podataka... vozilo se svejedno kreira" s "prazan VIN, nedostaje godina,
neparsabilan datum" kao izričitim primjerima koji NE smiju biti preskočeni,
dok test-scenarij na kraju kaže "5 vozila... 3 reda preskočena" (podrazumijeva
da SVA 3 pokvarena retka - uklj. nedostajuću godinu i loš datum, ne samo
duplikat VIN-a - budu preskočena). Ovo se izravno kosi s numeriranom
specifikacijom. **Odlučeno slijediti numeriranu specifikaciju kao mjerodavnu**
(eksplicitnija, ima vlastiti odjeljak naslovljen "DODAJ, ALI OZNAČI
NEPOTPUNO", i vlastiti izvještajni format u sekciji 3 razdvaja "uvezeno
(nepotpunih)" od "preskočeno zbog duplikata" kao dva odvojena brojača) -
test-scenarij tretiran kao vjerojatno neprecizna parafraza, ne kao izmjena
pravila. Rezultat s korisnikovim točnim test podacima (5 ispravnih + 3
pokvarena): **7 vozila uvezeno** (5 potpunih + 2 nepotpuna: nedostaje
godina, loš format datuma), **1 red preskočen** (duplikat VIN-a) - NE "5
vozila, 3 preskočena" kako bi test-scenarij doslovno sugerirao. Ovo je
jasno naglašeno korisniku u sažetku sesije da može ispraviti ako je
test-scenarij zapravo bio namjeravano ponašanje.

**1) CSV predložak.** Zaglavlja točno prema postojećem Vehicle modelu -
`marka,model,godina,VIN,registarska tablica,istek registracije` (format
datuma DD.MM.GGGG., isti kao svugdje u appu - `formatDateHr`/
`parseHrDateToIso`). Generira se ČISTO client-side (Blob download, UTF-8
BOM zbog Excela) - nema potrebe za API rutom za statičan tekst. Gumb i na
`/vehicles` (toolbar) i na novoj `/vehicles/import` stranici.

**2) Upload i parsing.** Nema postojeće CSV ovisnosti u repou (provjereno
prije dodavanja) - napisan lagan RFC4180-ish parser bez vanjske ovisnosti
(`packages/api/src/server/csv.ts`, ~50 linija - format je jednostavan
fiksni skup kolona, teška biblioteka poput papaparse nije opravdana).
Auto-detektira delimiter (zarez/točka-zarez) po zaglavlju - hr-HR Excel
lokal po defaultu sprema CSV sa točka-zarezom (zarez je decimalni
separator), pa predložak (zarez) ostaje kompatibilan i ako ga korisnik
otvori/spremi natrag kroz Excel.

**3) Validacija po redu.** `importVehiclesFromCsvRows` (`server/vehicles.ts`)
- svaki red se kreira NEOVISNO o nedostajućim/lošim poljima (marka/model
padaju na "Nepoznato" placeholder, godina/VIN/datum ostaju prazni) OSIM
kad nedostaje registarska tablica (shema zahtijeva NOT NULL+UNIQUE, nema
smislenog placeholdera za identifikacijsku oznaku vozila - JEDINO
odstupanje od "ništa se ne preskače" pravilo, ali korisnikovi VLASTITI
primjeri ("prazan VIN, nedostaje godina, neparsabilan datum") nikad nisu
spominjali praznu tablicu, pa ovo ne krši navedene primjere, samo
popunjava rupu koju nisu adresirali). Nova `Vehicle.hasIncompleteData`
(boolean) + `incompleteReasons` (String[], GOTOVI hrvatski tekstovi za
prikaz, ne field-key identifikatori - jedino mjesto koje ih čita je UI). **
Duplikati (VIN ili tablica) provjeravaju se DVOSTRUKO - protiv postojeće
baze (`findFirst` s `mode: "insensitive"`, case-insensitive da "zg1234ab"
ne proskliže kao "različit" od "ZG1234AB") I unutar istog CSV batcha
(running `Set`, jer se redovi umeću sekvencijalno pa bi drugi duplikat
unutar datoteke inače tiho prošao kao "nova" tablica prije nego prvi
commit stigne u bazu za usporedbu)** - oba slučaja se PRESKAČU i prijavljuju
kao greška retka (`skipped`), razdvojeno od `incompleteReasons` (koncept
"pravi duplikat" != "nepotpun podatak").

**Napomena o formatu izvještaja** - sekcija 3 eksplicitno traži "X vozila
uvezeno (od toga Y nepotpunih), Z redova preskočeno zbog duplikata" -
implementirano doslovno kao dva razdvojena brojača (`importedCount`
uklj. nepotpune, `skippedCount` isključivo duplikati/prazna-tablica), NE
kao jedan "problematični redovi" popis.

**3b) Oznaka nepotpunog vozila.** ⚠️ badge s `title` tooltipom na `/vehicles`
listi (uz marku/model) i banner (amber, isti stil kao ostala upozorenja
ovaj sesije) na `/vehicles/[id]` vrhu stranice, oba čitaju
`incompleteReasons` izravno. **Notifikacija replicira TOČAN obrazac
registracijskih podsjetnika** (`registrationReminders.ts`, provjeren prije
pisanja) - novi `Vehicle.incompleteDataNotifiedAt` dedupe timestamp (isti
mehanizam kao `registrationReminderXSentAt` - šalje se najviše jednom,
čak i ako se `incompleteReasons` kasnije promijene), nova
`runIncompleteVehicleDataCheck()` funkcija u istom modulu, novi
`sendIncompleteVehicleDataEmail` u `lib/email.ts`. **Razlika od
registracijskih podsjetnika namjerno**: šalje se SAMO owneru (ne i
aktivnom najmoprimcu - klijent nema razloga znati da je data-entry
nepotpun, za razliku od isteka registracije koji njega izravno pogađa).
**Nije dodan novi Vercel cron entry** (rizik probijanja plan limita broja
cron poslova - `vercel.json` već ima 2, dodavanje trećeg bez provjere
limita bi mogao ponoviti klasu deploy problema iz sedamnaestog nastavka) -
umjesto toga postojeća `/api/cron/check-registrations` ruta sad pokreće
OBA provjere (`Promise.all`) u istom dnevnom requestu.

**4) Duplikati** - vidi sekciju 3 gore (implementirano zajedno, ista
provjera pokriva oba zahtjeva).

**5) OCR-enabled dokumenti** - CSV import namjerno NE dira
`registrationDocKey`/`insurancePolicyKey` (ostaju `null`), dokumenti se i
dalje dodaju ručno po vozilu nakon uvoza, kako je traženo.

**UI.** Nova `/vehicles/import` stranica - predložak/upload/rezultat u
jednom toku, izvještaj prikazuje summary rečenicu + tablicu "Nepotpuna
vozila" (redak, link na vozilo, razlog) + tablicu "Preskočeni redovi"
(redak, razlog) - obje tablice, ne spojeno u jednu, jer predstavljaju
različite ishode (importirano-ali-nepotpuno vs. odbijeno).

**Migracija** (ručno napisana, isti razlog kao prijašnjih sedam nastavaka) -
3 nova stupca na `vehicles` (`hasIncompleteData` boolean default false,
`incompleteReasons` TEXT[] default prazan niz, `incompleteDataNotifiedAt`
nullable timestamp).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(`/vehicles/import`, `/api/vehicles/import-csv` vidljivi). **Stvaran
end-to-end test protiv produkcijske baze** (privremena debug ruta, isti
obrazac kao prijašnjih sedam nastavaka) - TOČNO korisnikov test scenarij iz
zahtjeva (CSV tekst, ne fabricirani objekti - testira i `parseCsv` i
`importVehiclesFromCsvRows` zajedno, stvaran upload-do-DB put): 5 ispravnih
redaka + duplikat VIN-a + nedostaje godina + loš format datuma (ISO umjesto
DD.MM.GGGG.) → svih 8 provjera prošlo (`importedCount:7`,
`incompleteCount:2`, `skippedCount:1`, točan redak/razlog za svaki od tri
problematična retka, svih 5 čistih redaka potvrđeno potpuno). Test podaci
(7 vozila) obrisani nakon verifikacije, ovaj put BEZ greške u čišćenju
(cleanup ID-jevi spremljeni u fajl iz JEDNOG poziva prije brisanja - naučeno
iz grešaka u prijašnja dva nastavka gdje je slučajan ponovni GET stvorio
duplicirane test podatke). **Notifikacijski cron path (`
runIncompleteVehicleDataCheck`) NIJE live-testiran** - namjerno, jer bi
stvaran poziv poslao pravi email na produkcijski `OWNER_EMAIL` (isti razlog
kao ranije u ovom logu za T&C/PDF testove); logika je doslovno preslikan
obrazac već dokazanog `runRegistrationExpiryCheck`-a i prošla je typecheck,
procijenjeno dovoljnim bez dodatnog live poziva. Debug ruta uklonjena
nakon verifikacije (`git status` potvrđuje čist diff).

---

**Prijašnji dio (dvadesetdrugi nastavak)** - korisnik zatražio
search barove za vozila/klijente, rental history + date-range filter po
vozilu, istaknut aktivan ugovor, i provjeru kompletnosti klijentovih
dokumenata (osobna+vozačka, obje strane).

**1) Search barovi.** Client-side filter (flota/klijenti su mali, isti
obrazac kao ostale liste u appu - ne paginira se) na `/vehicles` (marka/
model/registracija) i `/clients` (ime/OIB). **"Broj osobne" NAMJERNO
izostavljen iz pretrage** - to nije pohranjeno kao tekstualno polje nigdje
u shemi (samo skenirana slika dokumenta), pa se ne može tekstualno
pretraživati bez OCR ekstrakcije koju korisnik eksplicitno traži da se ne
dira.

**2) Rental history po vozilu.** `/vehicles/[id]` Ugovori tab: lista
sortirana po `dateFrom` opadajuće (najnovije prvo, bilo je nesortirano
prije), plus date-range filter (od/do inputi) po PREKLAPANJU razdoblja
najma s odabranim rasponom (ne strogo "unutar" - prazna granica = bez
ograničenja).

**3) Aktivan ugovor istaknut.** Novi banner (zelen, `status === "signed"`
i danas unutar `dateFrom`/`dateTo`) prikazan ODMAH ISPOD naslova vozila,
IZNAD tabova - vidljiv bez obzira koji je tab aktivan i bez scrollanja čak
i kad je default tab "Podaci o vozilu" (ne "Ugovori"), točno kako je
korisnik tražio ("ne zakopan u listi povijesti ispod").

**4) Kompletnost klijentovih dokumenata.** Provjeren postojeći Client
model prije početka (korisnikov eksplicitan zahtjev) - postojala su samo 2
slota (`driverLicenseKey`/`idDocumentKey`, JEDNA strana svaki, popunjena
isključivo kroz signing wizard). Dodana 4 NOVA slota
(`idDocumentFrontKey`/`idDocumentBackKey`/`driverLicenseFrontKey`/
`driverLicenseBackKey`) - stari 2 polja ZADRŽANA netaknuta (ne
preimenovana/uklonjena - i dalje ih signing wizard piše, taj kritičan,
već testiran put nije diran). Kompletnost/prikaz koristi fallback: "prednja
strana" broji se kao prisutna ako postoji ILI dedicated `*FrontKey` ILI
starije polje (`idDocumentFrontKey ?? idDocumentKey`, isto za vozačku) -
klijent koji je već prošao signing ne ispada lažno "nedostaje", iako
tehnički nikad nije koristio nova polja. Nema fallbacka za stražnju stranu
(ta nikad nije postojala prije ove promjene).

Nova `/clients/[id]` stranica (prije nije postojala nijedna client-detail
ruta) - osnovni podaci, 4 kartice dokumenata (isti staged-preview + "Spremi"
obrazac kao prometna/polica na vozilu), jasan warning banner "Nedostaje: X,
Y" (amber) ili "Svi dokumenti su priloženi" (zelen), upload izravno sa
stranice bez preusmjeravanja. Usput dodana i lagana "Ugovori" sekcija (bez
date-range filtera - taj je specifično tražen samo za vozila) jer prirodno
odgovara duhu zahtjeva "pregled povijesti... za klijente" iz naslova
zadatka. `/clients` lista sad linkuje svaki redak na novu stranicu.

**Namjerno NE blokira izdavanje ugovora** ako dokumenti nedostaju - samo UI
upozorenje na `/clients/[id]`. Ostavljen TODO komentar u
`createContractAndSendSigningEmail` (`server/contracts.ts`) - prirodno
mjesto gdje bi buduća blokada išla ako korisnik kasnije to zatraži
eksplicitno.

**Napomena o razdvajanju od OCR-a** (korisnikov eksplicitan zahtjev) - ovaj
rad je ČISTO o prisutnosti/dostupnosti slika dokumenata, nema nikakve
ekstrakcije podataka iz njih. Postojeći OCR moduli (`packages/api/src/ocr/`)
nisu dirani.

**Migracija** (ručno napisana, isti razlog kao prijašnjih pet nastavaka -
shadow-DB replay pada na pre-postojećoj migraciji) - samo 4 nova nullable
stupca na `clients`, bez podatkovnih promjena (fallback logika je čisto
runtime, ne backfill).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(`/clients/[id]`, `/api/clients/[id]`, `/api/clients/[id]/documents`
vidljivi u outputu). **Stvaran end-to-end test protiv produkcijske baze**
(privremena debug ruta, isti obrazac kao prijašnjih pet nastavaka): (a)
vozilo s 3 fabricirana ugovora (prošli/aktivni/budući) - detekcijska logika
identična onoj u UI-u ispravno prepoznala TOČNO jedan aktivan (onaj s
`status:"signed"` i danas unutar raspona), date-range filter (overlap
logika) ispravno uključio prošli+aktivni a isključio budući ugovor; (b)
test klijent SA starijim `idDocumentKey` (simulira signing-wizard upload)
potvrdio da `idDocumentFrontUrl` DTO polje ispravno pada natrag na to
starije polje (fallback radi), dok stražnja strana ostaje ispravno
"nedostaje" (nema fallbacka); (c) svježi klijent bez ijednog dokumenta →
sva 4 slota "nedostaje" potvrđeno → 4 stvarna upload poziva na Hetzner
(`setClientDocument`) jedan po jedan → broj prisutnih dokumenata rastao
točno `[1,2,3,4]` (korisnikov test scenarij "uploadaj jedan po jedan,
provjeri da status ispravno nestaje" potvrđen izravno) → presigned URL
finalnog uploada stvarno resolva (`curl` vratio `200`). Test podaci (2
vozila, 3 ugovora, 3 klijenta, 4 S3 objekta) obrisani nakon verifikacije -
**usput uhvaćena vlastita greška u čišćenju** (isti obrazac kao prijašnji
nastavak): slučajan ponovni `curl` na debug rutu je ponovno stvorio cijeli
test set, uhvaćeno odmah (ne pretpostavkom da je prvo čišćenje dovoljno),
identificirano po `_cleanupIds` u odgovoru i počišćeno drugim DELETE
pozivom s točnim id-jevima. Debug ruta uklonjena nakon verifikacije
(`git status` potvrđuje čist diff, bez privremenih exporta ovaj put - nije
trebao nikakav "TEMP" re-export iz `server/index.ts` jer su sve korištene
funkcije već bile trajno izvezene iz prijašnjih nastavaka). Nije testirano
kroz pravi owner login klik (stvaran `/vehicles/[id]`/`/clients/[id]` UI
prikaz) - isti razlog kao svugdje ranije u ovom logu (magic-link browser
test ocijenjen preskupim za ovu klasu promjene), oslonjeno na
tsc+build+izravno testiranu podatkovnu logiku iza UI-a.

---

**Prijašnji dio (dvadesetprvi nastavak)** - korisnik zatražio
versionirane uvjete korištenja (T&C) s uređivanjem u postavkama i pravim PDF
prilogom uz svaki potpisan ugovor. Prije početka provjereno gdje uvjeti
trenutno žive (korisnikov eksplicitan zahtjev): hardkodirani
`TERMS_VERSION`/`TERMS_TEXT` konstanti direktno u `sign/[token]/page.tsx`
(8 paragrafa placeholder pravnog teksta), `Contract.termsVersion` je bio
slobodan STRING koji je KLIJENT sam slao na submit (netočno "kod servera
ništa ne provjerava koju verziju je klijent stvarno vidio").

**Novi `TermsAndConditions` model** (versioned, `content` plain text -
paragrafi odvojeni praznim retkom, isti format kao stari TERMS_TEXT,
namjerno NE markdown/rich text - nema XSS rizika jer se nikad ne renderira
kao HTML, lako se uređuje u textarei i renderira u PDF bez parsera).
`active` boolean - točno jedan red je aktivan, održava se ISKLJUČIVO u
`createTermsVersion()` (transakcija: stari active→false, novi red→true),
namjerno bez DB-level partial unique indexa (jedino mjesto koje piše u
tablicu je ta funkcija - "trust internal code" konvencija). Stare verzije
se NIKAD ne brišu/mijenjaju - pravna dokaznost.

**Migracija seed-a v1 = TOČNO stari hardkodirani TERMS_TEXT** (copy-paste,
ne parafrazirano) - garantira kontinuitet, svaki već otvoren signing link
nakon deploya i dalje vidi identičan tekst. Ručno napisana migracija (isti
razlog kao prijašnja tri nastavka - shadow-DB replay pada na pre-postojećoj
migraciji), `prisma migrate deploy` izravno na produkcijsku bazu.

**Contract.termsVersionId** (nullable FK na TermsAndConditions) + **
Contract.termsPdfKey** (S3 key generiranog PDF snapshot-a). Stari
`Contract.termsVersion` (string) ZADRŽAN (ne uklonjen) - i dalje se
postavlja, ali sad IZVEDEN server-side iz `String(TermsAndConditions.version)`,
ne više iz klijentskog inputa - postojeći "(verzija X)" prikaz na
ContractPdf-u nije trebao izmjenu.

**Server nikad ne vjeruje klijentu koju verziju je vidio.** `GET /api/sign/
[token]` sad vraća `terms: {id, version, content}` (aktivna verzija u
trenutku resolvea) - signing wizard renderira TAJ sadržaj (uklonjen
hardkodirani TERMS_TEXT), i na finalni submit šalje natrag TOČNO taj
`terms.id` kao `termsId` (zamijenio stari slobodni `termsVersion` string u
`completeSigningRequestSchema`). `completeSigning` server-side resolvea
`TermsAndConditions` po tom id-u (odbija s `invalid_terms` ako ne postoji -
verzije se nikad ne brišu, pa nepostojeći id znači neispravan klijentski
zahtjev, ne "stara ali legitimna verzija") i sprema i `termsVersionId` i
izvedeni `termsVersion` string.

**PDF privitak.** Novi `TermsPdf.tsx` (zaseban jednostavan generator, isti
`styles.ts`/font infrastruktura kao ContractPdf, ne dio njega - sadržaj
varira u duljini i logički je zaseban dokument). `finalizeContractDocuments`
(`documents.ts`) generira ga iz `contract.termsAndConditions` (uključena
relacija) SAMO ako postoji (null za ugovore potpisane prije ovog polja -
graceful skip, ne baca), uploada uz ostale dokumente
(`contracts/{id}/documents/uvjeti-najma.pdf`), sprema `termsPdfKey`, dodaje
kao treći mail privitak (`lib/email.ts`-ov `sendSignedContractDocumentsEmail`
prošireno opcionalnim `termsPdf` parametrom). `ContractListItemDTO`
(`contracts.ts`) prošireno `termsPdfUrl` (presigned, isti obrazac kao
contractPdfUrl/protocolPdfUrl) - link "uvjeti" dodan uz postojeće "ugovor /
zapisnik" linkove na owner `/contracts` I client-facing `/portal` stranici
(korisnikov eksplicitan zahtjev "dohvatljiv i owneru i klijentu"). Vehicle
detail "Ugovori" tab NAMJERNO nije dirana (već ne prikazuje ni
protocolPdfUrl, lakši summary prikaz - dodavanje treće poveznice ovdje
procijenjeno kao nepotreban scope za ovaj zahtjev).

**UI (`/settings`).** Novi `TermsSection.tsx` (dodan uz postojeći
`SettingsForm`/logo blok, isti "settings" permission gate) - prikaz
trenutno aktivne verzije (broj + datum preko novog `formatDateTimeHr`
helpera, dodan u `lib/dateFormat.ts` jer nije postojao dijeljeni klijentski
datum+vrijeme formatter), textarea predispunjen aktivnim sadržajem, gumb
"Spremi novu verziju" (disabled dok se sadržaj ne promijeni ILI je prazan),
eksplicitna napomena da vrijedi SAMO za buduće ugovore. Povijest verzija
kao expand/collapse lista (broj, datum, "(aktivna)" oznaka, sadržaj na
klik). Novа `POST /api/terms` (`requireModulePermission(request,
"settings")`, isti modul kao ostale postavke tvrtke).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(`/api/terms` ruta vidljiva, `/sign/[token]` bundle SMANJEN 8.01→7.01 kB -
uklonjen veliki hardkodirani TERMS_TEXT string, `/settings` narastao
1.62→4.89 kB za novu sekciju). **Stvaran end-to-end test protiv
produkcijske baze** (privremena debug ruta, isti obrazac kao prijašnja tri
nastavka) - NAMJERNO zaobišao stvarno slanje mailova
(`finalizeContractDocuments`/`completeSigning` bi mailao pravi produkcijski
`OWNER_EMAIL` za fabricirane test ugovore, neželjen sporedni efekt), umjesto
toga direktno testiran terms-specifičan mehanizam: `createTermsVersion`
kreirao v2 (test sadržaj) → potvrđeno stari v1 postaje `active:false`, v2
`active:true`, v1 sadržaj NEPROMIJENJEN. Dva fabricirana test ugovora - A
(`termsVersionId` = novi v2) i B (`termsVersionId` = originalni v1) - svaki
kroz PRAVI `renderTermsPdf` + `uploadObject` (stvaran Hetzner upload).
Rezultat: ugovor A generirao PDF sa v2 (novim) tekstom, ugovor B generirao
PDF s IZVORNIM v1 tekstom - točno korisnikov test scenarij ("stari ugovori i
dalje pokazuju stari tekst") potvrđen izravno, bez potrebe čekati stvarno
kronološko potpisivanje dva ugovora. Jedan generirani PDF (ugovor A, v2)
preuzet i vizualno pregledan (Read tool) - naslov/podnaslov/sadržaj ispravno
renderirani. Test podaci (2 ugovora, test vozilo/klijent, test terms verzija
+ S3 objekti) obrisani, v1 vraćen kao aktivna verzija. **Usput uhvaćena i
ispravljena vlastita greška u čišćenju**: slučajni ponovni GET pozivi na
debug rutu (dok se provjeravalo stanje) su stvorili 5 dodatnih neplaniranih
test verzija (v3-v7, sve s test sadržajem) prije nego je vozilo unique
constraint zaustavio daljnje stvaranje ugovora - uhvaćeno provjerom
stvarnog DB stanja (ne pretpostavkom da je prvi cleanup bio dovoljan),
počišćeno zasebnim jednokratnim cleanup pozivom, potvrđeno da baza sad ima
TOČNO jedan (v1) red prije nastavka. Sve debug rute i privremeni
`renderTermsPdf` re-export uklonjeni (`git status` potvrđuje čist diff).

---

**Prijašnji dio (dvadeseti nastavak)** - korisnik zatražio
employee accounts s per-modul permisijama. Implementirano i verificirano
protiv stvarne baze, uklj. arhitektonske odluke koje je korisnik izričito
prepustio meni.

**Arhitektonske odluke (korisnik eksplicitno rekao "procijeni"):**
- **Employee NEMA ownerId/tenantId FK.** App je single-tenant (jedna
  rent-a-car tvrtka za cijelu bazu - Vehicle/Client/Contract su već globalni,
  bez tenant-scopinga bilo gdje). "Employee pripada owneru" shvaćeno kao
  "dio je istog poslovnog accounta", ne kao zahtjev za cross-tenant izolaciju
  koja ne postoji nigdje drugdje u shemi.
- **Contract.createdByOwnerId PROŠIREN sibling poljem
  (`createdByEmployeeId`), NE preimenovan/pretvoren u polymorphic union.**
  Razmatrane 3 opcije: (a) sibling nullable FK (odabrano), (b) polymorphic
  `createdByType` + `createdById` bez FK constrainta (gubi referencijalni
  integritet na DB razini), (c) zajednička "User" nadklasa za Owner/Employee
  (najveći refactor - dirao bi cijeli auth sloj radi jednog polja). App-level
  konvencija: točno JEDNO od dva polja je postavljeno, dokumentirano u
  schema.prisma komentaru.
- **Permisije: zaseban `EmployeePermission` model (redak = dodijeljen
  modul), NE JSON polje na Employee.** Korisnik spomenuo modularni pricing
  kao budući smjer - relacijski model se prirodno proširuje (upit "svi
  employeei s pristupom X" je direktan) bez migracije JSON sheme za svaki
  novi modul.
- **Employee login dijeli ISTU `/login` stranicu i magic-link mehanizam kao
  Owner** (ne novi "invite email" flow) - korisnik eksplicitno tražio da se
  replicira postojeći owner obrazac, koji se pokazao biti "pre-provisioniraj
  po emailu, korisnik sam zatraži magic link" (nema proaktivnog invite
  maila ni za ownera trenutno).

**Shema.** `Employee` (firstName/lastName/email @unique/status
active|deactivated/userId @unique nullable - isti obrazac kao Owner.userId),
`EmployeePermission` (`@@id([employeeId, module])`, postojanje retka =
dodijeljena permisija, nema "enabled: false" redaka), `PermissionModule` enum
(contracts/vehicles/clients/invoicing/settings - invoicing polje pripremljeno,
fakturiranje NIJE implementirano). `Contract.createdByEmployeeId` (nullable
FK, ne backfilla se retroaktivno). Migracija ručno napisana (isti razlog kao
prijašnja dva nastavka - shadow-DB replay pada na pre-postojećoj migraciji
20260820073000), primijenjena `prisma migrate deploy` izravno na
produkcijsku bazu.

**Auth sloj (`packages/api/src/server/auth.ts`, nove funkcije UZ postojeće,
ništa staro obrisano).** `SessionPrincipal` discriminated union
(`{kind:"owner",...}` / `{kind:"employee",...,permissions}`) normalizira
Owner i Employee u jedan tip za guardove/UI. `resolveOwnerAppPrincipal`
(owner uvijek puni pristup - hardcoded, ne editable, kako je traženo;
deaktiviran employee resolvea u `null` iako Supabase userId i dalje postoji -
deaktivacija tako funkcionalno gasi login bez brisanja Supabase accounta ili
`Contract.createdByEmployeeId` povijesti). `isEmailAllowedForOwnerApp` i
`linkAccountAfterOwnerAppLogin` prošireni ekvivalenti postojećih
owner-only funkcija, pozvani iz `/api/auth/owner/request-link`,
`/api/auth/callback`, `/api/auth/mobile/resolve` i `(owner)/layout.tsx` (svi
mjesta gdje se prije koristio `resolveOwnerByUserId`/`isEmailAllowedAsOwner`/
`linkOwnerAccount` direktno).

**Enforcement.** `apps/web/src/lib/requireOwnerSession.ts`: `requireOwnerSession`
zadržao ime i "je li ulogiran" ponašanje (samo JEDAN od 15 postojećih poziva
je čitao povratni `.owner` - `contracts/route.ts` - pa je promjena povratnog
oblika u `{principal}` bila jeftina, ostalih 14 poziva samo provjerava
`.authorized`). Nova `requireModulePermission(request, module)` - gatea
POST/PATCH/DELETE mutacije po modulu na SVIM postojećim rutama:
vehicles (`/api/vehicles` POST, `/api/vehicles/[id]` PATCH+DELETE, images,
registration-doc, insurance-policy, sva 3 OCR endpointa), clients
(`/api/clients` POST), contracts (`/api/contracts` POST, photo-requests),
settings (GET+PATCH+logo - JEDINI modul gdje se i ČITANJE gatea, nema
cross-modul razloga za čitanje settings podataka kroz API kao što ga ima
vehicles/clients listing za contract-kreiranje dropdown). GET/listing rute za
vehicles/clients/contracts NAMJERNO ostaju pod plain `requireOwnerSession`
(bilo koji ulogirani owner-app principal) - contracts-only employee treba
moći popuniti vehicle/client dropdown na "novi ugovor" formi. Nova
`requireOwnerOnlySession` - `/api/employees*` je IZVAN permission sustava u
potpunosti (čak ni employee sa "settings" permisijom ne smije upravljati
drugim employeeima/permisijama - privilege escalation granica, hardcodano na
`principal.kind === "owner"`).

**Mobile nasljeđuje enforcement automatski, BEZ ikakve mobile promjene** -
potvrđeno provjerom `apps/mobile/src/lib/api.ts`: `createVehicle`/
`updateVehicle`/`createClient` i mobile-ov `/api/contracts` poziv idu na
ISTE web API rute koje su upravo gatane, `requireOwnerSession` već podržava
Bearer token (mobile nema cookie jar). Mobile login (`role=owner` zaslon)
također dijeli `/api/auth/owner/request-link` i `/api/auth/mobile/resolve`
- employee se na mobileu resolvea kao `role: "owner"` (ista owner-mobile
app pokriva i owner i employee, permisije se provjeravaju po API pozivu, ne
po roli).

**Potpisni blok.** `documents.ts`-ov `issuedByName` proširen:
`contract.createdByOwner?.name ?? ...email ?? (createdByEmployee ?
firstName+lastName : null)`. `ContractPdf.tsx` NIJE trebao izmjenu (već
prima gotov `issuedByName` string, agnostičan na owner-vs-employee izvor).

**UI.** Nova `/employees` stranica (owner-only server-side gate, redirect na
`/vehicles` za bilo koga drugog) - lista employeeja, forma za dodavanje
(ime/prezime/email/permission checkboxovi), per-employee checkbox toggle po
modulu (PATCH, replace-cijeli-set semantika), aktiviraj/deaktiviraj gumb.
`(owner)/layout.tsx` nav sad uvjetan: "Postavke" link samo uz `settings`
permisiju, "Zaposlenici" link samo za pravog ownera. `/settings` stranica
podijeljena na server-component `page.tsx` (permission gate + redirect) +
novi `SettingsForm.tsx` client component (identičan prijašnji sadržaj,
premješten bez promjene logike) - sprječava direktnu navigaciju na URL, ne
samo API poziv. **Namjerno NIJE dirano:** "+ Dodaj vozilo"/"Novi klijent"
gumbi na `/vehicles`/`/clients` listing stranicama i dalje vidljivi
neovisno o permisiji (klik bi doveo do 403 s API-ja, funkcionalno
blokirano, ali gumb ostaje prikazan) - hvatanje ovoga na UI razini bi
tražilo novi "tko sam ja" endpoint + izmjenu 3 dodatne client-component
stranice, procijenjeno kao follow-up ako korisnik zatraži, ne dio ovog
zahtjeva (koji je tražio da se AKCIJA blokira, ne da se gumb sakrije).

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa, `next build` čist
(nove rute `/employees`, `/api/employees`, `/api/employees/[id]` vidljive).
**Stvaran end-to-end test protiv produkcijske baze** (privremena debug ruta,
ista tehnika kao prijašnja dva nastavka): kreiran test-employee sa SAMO
"contracts" permisijom, `userId` postavljen izravno (simulira magic-link
link bez pravog Supabase logina) → `resolveOwnerAppPrincipal` vratio
`kind:"employee", permissions:["contracts"]` → `principalHasPermission`
provjeren za svih 5 modula: `contracts:true`, ostala 4 `false` (točno
korisnikov test scenarij - ne može unijeti vozilo/klijenta, ne može u
postavke). Deaktivacija testirana → principal resolvea u `null`,
`isEmailAllowedForOwnerApp` vraća `false` (magic-link zahtjev bi bio
odbijen). Reaktivacija + dodavanje "vehicles" permisije testirana → korektan
replace-cijeli-set rezultat. **Potpisni blok s employee izdavateljem**
testiran stvarnim `renderContractPdf` pozivom (isti obrazac kao prijašnji
nastavak za logo) - generirani PDF pregledan (Read tool), potpisni blok
ispravno prikazuje "Za Test Rent d.o.o." / "Test Zaposlenik, 24. 08. 2026.
17:10". Test podaci (Employee red, cascade-obrisane permisije) obrisani
nakon verifikacije, debug rute i privremeni `renderContractPdf` re-export
uklonjeni (`git status` potvrđuje čist diff). Nije testirano kroz pravi
Supabase magic-link klik za employee login (isti razlog kao ranije - trošak
browser auth testa), ali `resolveOwnerAppPrincipal`/`isEmailAllowedForOwnerApp`
logika koju taj flow poziva je izravno testirana stvarnim pozivima iznad.

---

**Prijašnji dio (devetnaesti nastavak)** - korisnik zatražio dva
povezana feature-a: (1) Settings stranica za podatke tvrtke + logo, (2)
tekstualni potpisni blok "s naše strane" na Contract PDF-u. Oboje
implementirano, novom migracijom primijenjenom protiv produkcijske baze.

**1) Settings (`/settings`, novi `CompanySettings` model).** Singleton red
(fiksni `id: "singleton"`, `upsert` svugdje - owner ne mora ništa
inicijalizirati prije prvog posjeta): `name`/`oib`/`address`/`phone`/`email`
(svi nullable) + `logoKey` (S3 key, ista *Key konvencija kao svugdje drugdje)
+ `digitalCertificateKey` (nullable, REZERVIRANO - eksplicitan korisnikov
zahtjev "ostavi mjesta u shemi", NIJE implementirano, samo osigurava da
buduća nadogradnja ne zahtijeva izmjenu sheme). Nova `/settings` stranica
(dodan link u owner nav) - forma za podatke tvrtke (PATCH `/api/settings`) +
odvojen staged-preview logo upload blok (isti obrazac kao prometna/polica na
vozilu - lokalni preview odmah, upload tek na "Spremi logo" klik, POST
`/api/settings/logo`) + placeholder kartica "Digitalni certifikat - uskoro"
(ista konvencija kao "Servisna knjižica" placeholder na vozilu). Ovo
ZAMJENJUJE prijašnji `COMPANY_*` env-var izvor za PDF zaglavlje
(`documents.ts`-ov `getCompanyInfo()`) - potvrđeno da te env varijable nikad
nisu bile postavljene ni lokalno ni na Vercelu (`vercel env ls production`),
pa nema podataka za migrirati, čist cutover na DB.

**2) Tekstualni potpisni blok "Za {firma}: {izdavatelj}, {datum/vrijeme}"
na Contract PDF-u.** Novo `Contract.createdByOwnerId` (nullable FK na
`Owner`, ne popunjava se retroaktivno za postojeće ugovore - nema pouzdanog
načina odrediti tko ih je kreirao). `POST /api/contracts` sad prosljeđuje
`auth.owner.id` u `createContractAndSendSigningEmail` - budući da i mobile
kreira ugovore kroz ISTU tu web API rutu (potvrđeno, nema zasebne mobile
rute), izdavatelj se bilježi identično neovisno o tome je li ugovor kreiran
na webu ili mobileu. Timestamp bloka je `Contract.signedAt` (isti event kao
klijentov potpis, server-side, NE trenutak kreiranja ugovora - točno kako je
korisnik tražio). `finalizeContractDocuments` (`documents.ts`) sad `include`-a
`createdByOwner` i čita `getCompanyInfoForPdf()` (logo URL + tekstualni
podaci) umjesto starih env-var funkcija, prosljeđuje oboje u
`renderContractPdf`. `ContractPdf.tsx`: logo (`company.logoUrl`, ako postoji)
prikazan u gornjem lijevom kutu zaglavlja pored naziva tvrtke (nova
`companyHeaderRow`/`logo` stilska pravila), potpisni blok lijevo od
klijentovog potpisa sad prikazuje ime izdavatelja + `formatDateTime(signedAt)`
ispod naslova "Za {firma}" kad je `createdByOwner` poznat (fallback na stari
"samo datum" prikaz za ugovore bez zabilježenog izdavatelja). Budući da je
PDF generator jedinstven (`packages/api/src/pdf/`, korišten isključivo kroz
server-side `finalizeContractDocuments`), promjena vrijedi identično za
ugovore kreirane s weba i mobilea - nema odvojenog mobile PDF generatora.

**Verifikacija.** `tsc --noEmit` čist na sva tri paketa (web/mobile/api),
`next build` čist (nove rute `/settings`, `/api/settings`,
`/api/settings/logo` vidljive u outputu). Migracija ručno napisana (ne
`prisma migrate dev` - shadow-DB replay pada na PRE-POSTOJEĆOJ migraciji
`20260820073000_add_contract_number`, `setval` s 0 izvan raspona na praznoj
shadow bazi, nepovezano s ovom promjenom) i primijenjena `prisma migrate
deploy` (bez shadow baze) izravno na produkcijsku bazu, potvrđeno "All
migrations have been successfully applied". **Stvaran end-to-end test PDF
renderiranja** (privremena debug ruta bez auth-a, isti obrazac kao ranije
sesije - vidi bug #42/#45): `renderContractPdf` pozvan s fabriciranim
podacima + pravim `data:` URI test logom (react-pdf potvrđeno podržava
`data:image/...;base64,...` kao `Image src`, provjereno u izvornom kodu
`@react-pdf/image` prije oslanjanja na to), generirani PDF pregledan
(Read tool na PDF) - logo vidljiv u kutu zaglavlja, potpisni blok prikazuje
"Za Test Rent d.o.o." / "Branimir Malenica, 24. 08. 2026. 16:32" točno kako
je traženo. **Stvaran end-to-end test Settings DB+Hetzner pipelinea**
(druga privremena debug ruta): `updateCompanySettings` + `setCompanyLogo` s
pravim malim PNG-om uploadanim na Hetzner, `getCompanySettings()` round-trip
potvrđen (`curl` na presigned URL vratio `200`/`image/png`), test podaci
(DB red + S3 objekt) obrisani nakon verifikacije (potvrđeno `curl` na isti
presigned URL nakon brisanja vraća `404`). Obje debug rute i privremeni
`renderContractPdf` re-export iz `server/index.ts` uklonjeni nakon testiranja
(`git status` potvrđuje čist diff, bez ostataka). Nije testirano kroz pravi
owner login klik (stvaran `/settings` UI submit) - isti razlog kao ranije u
ovom logu (magic-link browser test ocijenjen preskupim za ovu klasu
promjene), ali podležeća server logika koju UI poziva je izravno testirana
stvarnim pozivima iznad.

---

**Prijašnji dio (osamnaesti nastavak)** - korisnik potvrdio
(screenshot produkcije, `/vehicles/new`) da deploy fix iz sedamnaestog
nastavka drži - stranica se učitava ispravno, dva OCR slota (vanjska/
unutarnja prometna) rade kako treba. Uočio da polica osiguranja OCR/prefill
namjerno postoji SAMO na edit ekranu (`/vehicles/[id]`), ne na `/vehicles/
new` (dokumentirana arhitektonska odluka iz trinaestog nastavka - vozilo
još ne postoji, pa nema kamo trajno uploadati PDF). **Korisnik eksplicitno
tražio da se ta odluka promijeni** - polica OCR treba postojati i na
`/vehicles/new`, konzistentno s owner-mobileom koji to već ima (trinaesti
nastavak, `apps/mobile/app/owner/vehicles/new.tsx`).

Implementirano na webu (`apps/web/src/app/(owner)/vehicles/new/page.tsx`),
1:1 isti obrazac kao postojeća dva OCR slota na istoj stranici i policу
OCR na edit ekranu: treći border-box blok "Skeniraj policu osiguranja
(OCR, opcionalno, PDF)", `accept="application/pdf"`, poziva postojeći
`POST /api/ocr/insurance-policy` (bez promjene rute/backend logike - isti
endpoint kao edit ekran). Vozilo još ne postoji pa se PDF NE uploada
trajno, samo šalje na ekstrakciju (isto ograničenje kao mobile `new.tsx` -
stvaran upload police ide na edit ekranu nakon "Spremi vozilo"). Prefila
`registrationExpiresAt`/`licensePlate`/`vin`, ista napomena o pretpostavci
("istek osiguranja kao proxy za istek registracije") kao na edit ekranu.
**Nužna prateća izmjena:** `registrationExpiresAt` `<input type="date">` je
prije bio nekontroliran (čitan iz `FormData` tek na submit) - OCR prefill
zahtijeva da ga postavi izvana, pa je pretvoren u kontroliran input
(`useState` + `value`/`onChange`), `handleSubmit` sad čita iz state-a
umjesto `FormData.get`. Ponašanje pri ručnom unosu nepromijenjeno.
Verifikacija: `tsc --noEmit` čist, `next build` čist (`/vehicles/new` ruta
i dalje prisutna, veličina rasla s 4.13 kB na 4.7 kB - očekivano za jedan
novi blok). **Nije vizualno potvrđeno kroz browser** - `/vehicles/new` je
owner-auth-zaštićen, isti razlog kao više puta ranije u ovom logu
(magic-link browser test prije eksplicitno ocijenjen preskupim za ovaj tip
promjene, typecheck+build prihvaćen kao dovoljna verifikacija jer kod vjerno
kopira već potvrđen obrazac). Nije još commitano/pushano - čeka korisnikovu
potvrdu.

---

**Prijašnji dio (sedamnaesti nastavak)** - korisnik prijavio
da Vercel deploy pada s "No Output Directory named 'public' found" i da
polica osiguranja sekcija nedostaje na webu. **Ključan nalaz: OVAJ REPO
JE SPOJEN NA DVA ODVOJENA VERCEL PROJEKTA**, oba se auto-deployaju na
svaki `git push` na `main`:
- **`fleet-manager-web`** (ID prj_GuhxepNNWMM3QdadMre3sVtEUpe2) - Root
  Directory `apps/web`, Framework Next.js, ispravno konfiguriran. OVO je
  projekt na koji je cijela dosadašnja sesija testirala (mobile API base
  URL, magic-link login, svi OCR-i) - **nikad nije pao ni jednom u
  zadnjih tjedan dana** (`vercel ls` potvrdio, svi "Ready").
- **`fleet-manager`** (bez "-web", ID prj_eEUHRE3gOgCFbdAFoow6wRAIPpuB,
  kreiran 16.08.) - Root Directory `.` (cijeli monorepo root, NE
  `apps/web`), Framework **"Other"** (ne Next.js), Output Directory
  default `public`-ako-postoji. **Pada na SVAKI deploy otkad postoji**
  (potvrđeno `vercel ls fleet-manager` - dosljedan niz `Error` statusa
  unatrag barem tjedan dana). Njegov produkcijski URL
  (`fleet-manager-branimir-s-projects1.vercel.app`) vraća čist `404`
  (potvrđeno `curl`) - nikad nije uspješno poslužio ništa.

**"Public directory" greška NIJE bug u repou - to je Vercel PROJEKT
POSTAVKA na `fleet-manager` projektu.** Build sam po sebi uspijeva čisto
(potvrđeno stvarnim `vercel inspect --logs` - turbo "2 successful, 2
total", sve rute izlistane identično kao na radnom projektu) - greška se
javlja NAKON builda, na Vercel platform sloju, jer s Framework="Other" i
Root Directory="." platforma ne zna da treba tražiti `.next` output u
`apps/web` podfolderu, pa pada natrag na default "statički site, traži
`public/`" ponašanje. Provjereno da NIJE uzrokovano repo kodom: nema
`vercel.json` s `outputDirectory`/`framework`/`builds` poljem nigdje osim
`apps/web/vercel.json` (samo `crons` konfiguracija, bez override polja),
nema `output: "export"` u `next.config.mjs`, git log/blame oba fajla ne
pokazuje ništa sumnjivo.

**Ovo NIJE nešto što se može popraviti commitom/pushom** - Root
Directory i Framework Preset su Vercel dashboard/CLI projekt-postavke,
izvan gita. Claude nije poduzeo nijednu popravku jednostrano (obje
opcije - popraviti postavke ili obrisati - nepovratne su/utječu na
dijeljeni Vercel account izvan lokalnog repoa), nego pitao korisnika.
**Korisnik odabrao: obrisati.** `vercel project rm fleet-manager`
(potvrđeno preko `echo "y" | ...` jer `--non-interactive` flag sam po
sebi nije preskočio potvrdni prompt u ovoj CLI verziji), potvrđeno
`vercel project ls` - `fleet-manager` više ne postoji, samo
`fleet-manager-web` ostaje spojen na ovaj repo. Problem time potpuno
zatvoren - više nema drugog projekta koji bi mogao zbuniti buduće
provjere dashboarda.

**Polica osiguranja NIJE nedostajala zbog koda** - `fleet-manager-web`
(radni projekt) je potvrđeno ažuriran (deployment timestamp se poklapa
točno s zadnjim pushom), i kod za policu (uklj. sve OCR popravke iz
prijašnjih nastavaka) je u produkciji. Korisnikova opažena "nedostaje
polica" je vjerojatno bila ili stara cache/prije-pusha provjera, ili
(vjerojatnije) provjera pogrešnog projekta (`fleet-manager`, koji vraća
čist 404, ne stranicu s manjkajućom sekcijom) - potvrđeno da problem
nestaje sam po sebi provjerom pravog projekta, bez potrebe za bilo kakvim
dodatnim kodom.

**Turbo.json popravci (repo-level, DIREKTNO commitano/pushano/
verificirano protiv stvarnog Vercel builda):**
1. Dodan `globalEnv` s punom listom env varijabli koje app koristi
   (`DATABASE_URL`, `HETZNER_S3_*`, `RESEND_*`, `GOOGLE_VISION_API_KEY`,
   itd.) - prije nedostajale u `turbo.json`, pa Turborepo cache hash nije
   znao da build output ovisi o njima (rizik korištenja zastarjelog
   cache-a nakon promjene env varijable na Vercelu).
2. Novi `"@rent-a-car/api#build"` paket-specifičan task override
   (`outputs: []`) - riješio zaseban, nepovezan warning "no output files
   found for task @rent-a-car/api#build" (taj paket samo radi `prisma
   generate`, koji ne piše u `.next/**`/`dist/**` kako globalna `build`
   task definicija očekuje).
3. **Usput otkrivena i ispravljena vlastita greška u prvom pokušaju**:
   paket-specifični task override u Turborepo POTPUNO ZAMIJENI globalnu
   task definiciju (ne merge po polju, kako sam prvo pretpostavio) - moj
   prvi pokušaj (`env` unutar `@rent-a-car/api#build` override-a) je time
   slučajno IZBRISAO naslijeđenu env listu za taj task, uzrokujući GORI
   warning ("env varijable postavljene na Vercelu, ali nedostaju u
   turbo.json - may cause build to fail"). Uhvaćeno provjerom stvarnog
   sljedećeg build loga (ne pretpostavkom da je prvi pokušaj radio),
   popravljeno premještanjem cijele liste u `globalEnv` (primjenjuje se
   na SVE taskove neovisno o task-specifičnim override-ima, službeno
   dokumentiran Turborepo mehanizam za točno ovaj slučaj).
4. Lokalni `turbo build`/`pnpm build` ne radi na ovom Windows stroju
   (`spawn UNKNOWN` - nedostaje `turbo-windows-64` native binary u pnpm
   store-u, `pnpm install` ga ne vraća) - nepovezano s ovim promjenama,
   pre-postojeći lokalni tooling gap. Sva verifikacija ovog fixa napravljena
   direktno protiv stvarnih Vercel build logova (tri uzastopna deploya,
   svaki inspektiran `vercel inspect --logs`) umjesto lokalnog testa -
   finalni deploy potvrđeno čist, nula turbo warninga.

**Prijašnji dio iste sesije (šesnaesti nastavak) - korisnik ponovio
test s istim PDF-om nakon petnaestog nastavka, `parse_failed` I DALJE
prisutan. Korisnik eksplicitno tražio pravi log prije bilo kakvog drugog
pokušaja (ne nagađati drugi polyfill). Svjež `vercel logs` otkrio DRUGI,
RAZLIČIT crash - DOMMatrix fix je uspio (taj dio više ne puca), ali odmah
iza njega novi: `Error: Setting up fake worker failed: "Cannot find
module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'"`. Vidi bug #45
dodatak niže za pun dokazni lanac i mehanizam. Ukratko:
- pdfjs-dist u Node okruženju bez pravog Worker konteksta ("fake worker")
  interno radi `import(this.workerSrc)` gdje je `this.workerSrc` RUNTIME
  IZRAČUNATA varijabla, ne statički string literal - Next-ov file tracer
  (`@vercel/nft`) prati SAMO statičke import specifiere, pa `pdf.worker.mjs`
  (2MB, stvarno potreban) nikad nije uključen u Vercel serverless bundle.
- Pronađen i iskorišten pdfjs-dist-ov SLUŽBENI izlaz za točno ovaj slučaj
  (čitanjem stvarnog izvornog koda `pdf.mjs`, ne dokumentacije/nagađanja):
  ako je `globalThis.pdfjsWorker.WorkerMessageHandler` već postavljen,
  pdfjs-dist preskače dinamički import u potpunosti. Fix: `pdfText.ts`
  sad SAM uvozi `pdfjs-dist/legacy/build/pdf.worker.mjs` (i dalje
  dinamički pozvano - zadržava odgodu iz buga #43 - ali specifier je
  statički string literal, pa GA Next-ov tracer MOŽE pratiti) i postavlja
  taj global PRIJE poziva `pdf-parse`-a.
- `pdfjs-dist` dodan kao eksplicitna direktna ovisnost i `packages/api`-u
  i `apps/web`-u (isti razlog i obrazac kao `pdf-parse` u bugu #43 -
  tranzitivna ovisnost nije pouzdano resolvable odande gdje se ruta
  stvarno izvršava). Nova ambient `.d.ts` deklaracija (dupliciran u OBA
  paketa - `apps/web`-ov tsconfig `include` ne seže izvan vlastitog
  direktorija, pa deklaracija iz `packages/api` nije vidljiva čak ni kad
  se `pdfText.ts` type-checka kao dio `apps/web` kompilacije preko
  `transpilePackages`) jer `pdfjs-dist` ne izvozi tipove za ovaj duboki
  worker subpath.
- Verifikacija: `tsc --noEmit` čist na oba paketa, `next build` čist,
  ekstrakcija protiv stvarnog Adriatic PDF-a lokalno i dalje vraća
  identičan tekst s oba fixa aktivna (nema regresije), regresija-testirano
  protiv auth rute (bug #43 fix i dalje drži). **Kao i prošli put, NIJE
  moguće lokalno reproducirati originalni crash** (Windows build/start
  nikad nije pucao ni za ovaj drugi crash) - čeka stvaran test u
  produkciji nakon deploya.

**Prijašnji dio iste sesije (petnaesti nastavak) - korisnik testirao
policu osiguranja OCR na novom EAS buildu (novi `/vehicles/new` mobile
ekran), dobio `parse_failed`. Ovo je TOČNO neriješeni rizik zabilježen na
kraju buga #43 - potvrđeno `vercel logs` (ne pretpostavkom): `Reference
Error: DOMMatrix is not defined` iz `pdfjs-dist`-a, sad unutar OCR rute
samе (izolacija iz buga #43 je radila - ne curi više u login, ali sama
OCR ekstrakcija i dalje puca). Vidi bug #45 niže. Fix: `packages/api/src/
ocr/pdfText.ts` sad postavlja minimalne stub-ove za `DOMMatrix`/`Path2D`/
`ImageData` na `globalThis` PRIJE dinamičkog uvoza `pdf-parse`-a - poznat
workaround za pdfjs-dist u Node okruženju bez canvas biblioteke kad je
potrebna samo tekst-ekstrakcija (ne pravi rendering). Verificirano lokalno
da ekstrakcija i dalje radi ispravno sa stub-ovima aktivnim (stvaran
Adriatic PDF, isti tekst kao prije). **NIJE moguće lokalno reproducirati
originalni crash** (Windows next build/start ionako nikad nije pucao,
razlog te razlike nikad nije utvrđen - vidi bug #43), pa ovaj fix čeka
stvaran test u produkciji nakon idućeg EAS builda/deploya prije nego se
smatra potvrđeno riješenim.

**Prijašnji dio iste sesije (četrnaesti nastavak) - korisnik poslao
STVARAN PDF police osiguranja (Adriatic osiguranje AO, priloženo u chatu)
i prijavio da ekstrakcija ne pogađa ovaj format ("Istek godišnjeg
osiguranja" umjesto bilo koje fraze iz stare fiksne liste), eksplicitno
tražio generalizaciju umjesto dodavanja još jednog keyworda. Vidi bug #44
niže za pun dokazni lanac (stvaran tekst PDF-a, dva otkrivena buga u
prvom prolazu generalizacije, sva 4 test scenarija na kraju prolaze).
Ukratko:
- **Ekstrakcija prepravljena s liste točnih fraza na širi
  pattern-match:** red po red teksta, bilo koja riječ iz skupa ("istek"/
  "isteka" prioritetno, "vrijedi do"/"važi do"/"važenja"/"trajanje"/
  "razdoblje" kao širi fallback) + datum u ISTOM ili SLJEDEĆEM retku.
  Otkriven i popravljen usput: stvaran PDF duplicira SVAKI redak teksta
  (artefakt kako je dokument generiran) - bez deduplikacije susjednih
  identičnih redaka, "sljedeći redak" nakon labela bi bio još jedna
  kopija labela, ne stvarna vrijednost. Otkriven i popravljen DRUGI bug u
  istom prolazu: kad je više datuma u istom retku ("od X do Y"), kod je
  prvo uzimao PRVI (početak), ne ZADNJI (kraj) - regresija na starom
  sintetičkom testu koja je odmah uhvaćena ponovnim pokretanjem svih
  test scenarija prije prijave gotovosti.
- **Arhitektonska odluka formalno dokumentirana** (vidi sekciju 3 niže,
  "Polica osiguranja: istek osiguranja kao proxy za istek registracije")
  - korisnik je eksplicitno pitao je li ovo bila namjerna odluka ili
    slučajna konfuzija naziva. Odgovor: bila je namjerna pretpostavka,
    ali je prije bila dokumentirana SAMO u kod komentaru (`extractInsurancePolicy.ts`),
    nikad kao formalna arhitektonska odluka - sad ispravljeno. Stvaran
    Adriatic primjer POTVRĐUJE pretpostavku (polica ima jasno razdvojeno
    godišnje razdoblje osiguranja, ne doslovno polje "istek registracije"),
    ali UI tekst je bio precizniji nego što stvarno jest - ažuriran svugdje
    (web + oba mobile ekrana) da eksplicitno kaže "istek osiguranja
    (procjena/pretpostavka isteka registracije)" umjesto da tvrdi "datum
    isteka registracije" kao da je to doslovno pročitano polje.
- **Nova paralelna ekstrakcija: tablice i VIN iz police** (uz postojeći
  datum) - PDF tekstualni sloj je pouzdaniji izvor od slikovnog OCR-a
  fotografirane prometne, pa vlasnik može unakrsno provjeriti. Marka/
  model NAMJERNO nisu vađeni - polica ih navodi kao jedan spojen string
  ("BMW, SERIJA 4 430I"), nema pouzdanog načina razdvojiti bez lomljivog
  nagađanja. Novi dijeljeni `packages/api/src/ocr/patterns.ts`
  (VIN_PATTERN/PLATE_PATTERN) - `extractRegistrationDoc.ts` refaktoriran
  da ih uvozi odatle umjesto lokalne duplicirane definicije (čist
  refactor, ponašanje nepromijenjeno, prometna OCR flow NIJE dirana kako
  je korisnik tražio).
- Verifikacija: `tsc --noEmit` čist na sva tri paketa (uklj. mobile-ov
  lokalni `InsurancePolicyOcrResult` DTO u `api.ts`, koji je trebao ista
  dva nova polja), `next build` i `expo export --platform ios` oba čista.
  Regresija-testirano protiv auth rute (bug #43 i dalje popravljen -
  `403`, ne crash) i protiv stvarnog Adriatic PDF-a kroz pravu rutu
  (401 bez auth-a, kao očekivano - stvarna ekstrakcijska logika
  potvrđena izravnim pozivom `extractInsurancePolicyFields` na stvaran
  izvučen tekst PDF-a, vraća točno `registrationExpiresAt: "2027-07-07"`,
  `licensePlate: "ZG1278JI"`, `vin: "WBA51AP05PCL47053"` - sve se poklapa
  sa stvarnim sadržajem police).

**Prijašnji dio iste sesije (trinaesti nastavak) - korisnik potvrdio
da mobile magic-link login radi (bug #43 fix uspješan). Odmah zatim
otkrio pravi nedostatak funkcionalnosti: **owner-mobile nema ekran za
dodavanje NOVOG vozila** (`owner/vehicles/[id].tsx` postoji za uređivanje,
`new.tsx` nikad nije postojao - potvrđeno u prijašnjoj sesiji, ne
regresija). Napravljen `apps/mobile/app/owner/vehicles/new.tsx` po uzoru
na web `/vehicles/new` + postojeći mobile edit ekran: dropdown marka/model
(chips, isti obrazac kao edit ekran)/godina, tablice, VIN, datum isteka
registracije (DD.MM.GGGG. tekstualni unos + `parseHrDateToIso` validacija).
**Sva tri OCR slota** (vanjska/unutarnja strana prometne, polica
osiguranja) - korisnik eksplicitno tražio sva tri i ovdje, iako web-ov
`/vehicles/new` trenutno ima samo dva (vanjska+unutarnja, ne policu, jer
polica upload postoji tek na edit ekranu) - mobile ovdje ide MALO ISPRED
weba po korisnikovom eksplicitnom zahtjevu (owner možda ima PDF police
pri ruci dok unosi novo vozilo, korisno prefilati datum isteka registracije
i prije nego vozilo uopće postoji, iako se sam PDF ne može trajno spremiti
dok vozilo ne postoji). Isti dvokoračni flow kao web: `new.tsx` NE uploada
nikakve trajne dokumente (samo tri OCR ekstrakcijska poziva za prefill),
"Spremi vozilo" kreira vozilo (`POST /api/vehicles`, nova `createVehicle`
funkcija u `api.ts`) pa `router.replace` na postojeći edit ekran
(`/owner/vehicles/[id]`) gdje se stvarni upload prometne/police/slika
odvija - isti obrazac kao `contracts/new.tsx` (`router.replace`, ne
`push`, da "natrag" ne vrati na praznu formu). Dodan "+ Dodaj vozilo" gumb
na `owner/vehicles/index.tsx` (prije nije postojao nijedan način da se
dođe do ovog ekrana) - identičan `newButton` stil kao već postojeći
"+ Novi ugovor" na `contracts/index.tsx`. Verifikacija: `tsc --noEmit`
čist, `npx expo export --platform ios` uspješno izbundlao 1216 modula
(raslo s 1215, očekivano za jedan novi ekran). **Nije testirano na
uređaju** - korisnik treba novi EAS build.

**Prijašnji dio iste sesije (dvanaesti nastavak) - P0 regresija:
`pdf-parse` je slomio OWNER I CLIENT LOGIN u produkciji (ne samo mobile),
otkriveno i popravljeno.** Korisnik prijavio `request_failed_500` na
mobile magic-link zahtjevu, eksplicitno tražio pravi log prije fixa. Vidi
bug #43 niže za pun dokazni lanac - ukratko: `Vercel Function Logs`
otkrili `ReferenceError: DOMMatrix is not defined` iz `pdfjs-dist` na
`POST /api/auth/owner/request-link` - ruta koja NIKAD ne dira OCR. Uzrok:
`packages/api/src/server/index.ts` je `export *` barrel, pa je statički
top-level `import` u `pdfText.ts` (dodano prošle sesije za policu
osiguranja) povukao `pdf-parse`/`pdfjs-dist` u SVAKU rutu koja uvozi bilo
što iz tog barrela - **web login je bio JEDNAKO slomljen kao mobile**, ne
samo mobile-specifičan problem kako je isprva sumnjano. Fix: import
promijenjen u dinamički (`await import("pdf-parse")` unutar funkcije koja
ga stvarno treba), commitano i **odmah pushano uz eksplicitnu korisnikovu
potvrdu** (P0 - aktivan prekid logina za sve korisnike). Verificirano
DIREKTNO protiv produkcije nakon deploya (ne pretpostavkom): `curl` na
istu rutu koja je prije pucala vraća čist `403 not_authorized` (očekivano
za neovlašten email), Vercel logovi potvrđuju `info` razinu, ne `error`.
Sve tri OCR rute također provjerene (401 unauthorized, bez crasha).
**Preostaje neriješeno:** DOMMatrix problem je samo IZOLIRAN (ne curi više
u nepovezane rute), ne i stvarno popravljen za slučaj kad se
insurance-policy OCR STVARNO pozove (autentificirano, sa stvarnim PDF-om) -
lokalni `next build`+`next start` na Windowsu NE reproducira crash (dokazano
probom), što znači da moja ranija "verifikacija" te funkcionalnosti prošle
sesije (lokalni dev server) nije reprezentativna za Vercelov Linux
serverless runtime. Insurance-policy OCR treba stvaran test u produkciji
prije nego se smatra pouzdano radnim - ako i dalje puca s istom DOMMatrix
greškom, treba dodatni fix (npr. `@napi-rs/canvas` ovisnost, ili
alternativna PDF text-parsing biblioteka bez canvas-zavisnih polyfilla).

**Prijašnji dio iste sesije (jedanaesti nastavak) - sva tri OCR slota
(vanjska/unutarnja strana prometne, polica osiguranja) prenesena s weba na
`owner-mobile` (`apps/mobile/app/owner/vehicles/[id].tsx` - `new.tsx` ne
postoji na mobileu, potvrđeno prije rada, owner-mobile nema vehicle-creation
flow, samo edit). **Čisto UI posao, nema novog backend koda** - postojeći
`/api/ocr/registration-doc-outer`, `/api/ocr/registration-doc-inner`,
`/api/ocr/insurance-policy` endpointi su već platform-agnostic (Bearer-auth
preko `requireOwnerSession`, isti kao svi ostali owner API pozivi). Tri
nove funkcije u `src/lib/api.ts` (`ocrRegistrationDocOuter/Inner`,
`ocrInsurancePolicy`), sve koriste postojeći `uploadPickedFile` helper
(`expo-file-system` `File.upload()`, isti obrazac kao `uploadVehicle
RegistrationDoc`/`InsurancePolicy` - vidi bug #30 zašto NE goli
`apiFetch`+`FormData`). Odabir fajla ide preko `expo-document-picker`
(`type: ["image/*"]` za oba prometna slota, `type: ["application/pdf"]`
za policu) - identičan poziv-oblik kao postojeći `handlePickRegistrationDoc`/
`handlePickInsurancePolicy`, samo uži `type` filter po slotu. Svaki slot je
dvokoračan (odaberi pa "Skeniraj i prefilaj" kao odvojen gumb - isti UX kao
web, daje vlasniku priliku provjeriti odabir prije poziva) i potpuno
odvojen od postojećih persisted-upload gumba (OCR ne sprema ništa, čisto
prefill). Unutarnja strana i polica OCR blokovi su smješteni UNUTAR
postojećih "Prometna"/"Polica osiguranja" sekcija (dodatni gumbi), vanjska
strana je nova zasebna sekcija iznad "Prometna". `ActivityIndicator` na
"Skeniraj i prefilaj" gumbu dok poziv traje (Vision API/PDF parsing može
potrajati par sekundi). Marka/model/VIN prefill logika (uklj. VEHICLE_MAKES
match/fallback na "Ostalo") i ISO→`DD.MM.GGGG.` konverzija datuma
(`isoToHrDate`) kopirane 1:1 iz web ekvivalenta. Verifikacija: `tsc
--noEmit` čist, `npx expo export --platform ios` uspješno izbundlao 1215
modula (raslo s 1176 iz faze 2, očekivano). **Nije testirano na uređaju**
(Claude Browser Pane ne prikazuje Expo app) - korisnik treba novi EAS
build da vidi na telefonu, kao i za sve prijašnje mobile promjene.

**Prijašnji dio iste sesije (deseti nastavak) - korisnik potvrdio da su
OCR razdvajanje prometne (vanjska/unutarnja) I login fix (bug #40) uspješno
testirani uživo. Odmah zatim implementirana zadnja Tier 2 stavka (web): PDF
text-parsing police osiguranja za datum isteka registracije** - novi
`packages/api/src/ocr/pdfText.ts` (`pdf-parse` v2, PDF-ov ugrađeni
tekstualni sloj, NE Vision OCR - polica je generirani dokument s pravim
tekstom, ne fotografija) + `extractInsurancePolicy.ts` (keyword-anchored
pretraga datuma - "istek registracije"/"tehnički pregled"/"vrijedi do"/
"razdoblje osiguranja" i sl., prioritet od najspecifičnijeg izraza,
fallback na najkasniji datum bilo gdje u dokumentu). Nova ruta
`POST /api/ocr/insurance-policy`, gumb "Skeniraj i prefilaj" na `/vehicles/
[id]` policа kartici (zamijenio raniji placeholder caption).

**Usput otkriven i popravljen stvaran runtime bug, isti razred kao bug #11
(@react-pdf/renderer u RSC webpack sloju), ovaj put za `pdf-parse`/
`pdfjs-dist`.** Prvi pokušaj (`experimental.serverComponentsExternalPackages`,
isti recept kao bug #11) NIJE upalio - potvrđeno stvarnom runtime greškom
(`TypeError: Object.defineProperty called on non-object` iz
`pdfjs-dist/legacy/build/pdf.mjs` kroz Next-ov `(rsc)` webpack sloj), ne
pretpostavkom, inspekcijom stvarnog `.next` build outputa (vidi bug #42
niže za pun dokazni lanac). Konačan fix: `pdf-parse` dodan kao direktna
ovisnost i `apps/web`-u (ne samo `packages/api`) - pod pnpm strict
izolacijom, Next-ov externalPackages tracer ne uspijeva pratiti paket koji
je resolvable SAMO iz tranzitivne ovisnosti. Verificirano stvarnim
runtime pozivom kroz Next dev server (privremena debug ruta bez auth-a,
uklonjena nakon testiranja) - 3 sintetička PDF scenarija (keyword-anchored,
specifičniji keyword, čist fallback), sva tri vraćaju točan datum. Usput
otkriven i popravljen bug u window-sizing logici (prvi pokušaj je hvatao
datum iz SLJEDEĆE, nepovezane rečenice jer je prozor bio fiksnih 100
znakova umjesto da stane na sljedećem retku).

**Tier 2 backlog je sad potpuno gotov** (OCR prometne + polica), osim
opcionalne stavke "OCR za osobnu/vozačku" koja nikad nije bila obavezna.
Nije još commitano/pushano - čeka korisnikovu potvrdu i idealno test na
stvarnoj polici (heuristika za točan naziv polja na hrvatskoj polici je
prvi prolaz, nije potvrđena protiv pravog dokumenta).

**Prijašnji dio iste sesije (osmi/deveti nastavak) - OCR na prometnoj
dozvoli razdvojen na dva odvojena slota (vanjska/unutarnja strana) po
korisnikovom dizajnu, plus popravljen VIN ekstrakcijski bug otkriven usput.
Korisnik je naknadno potvrdio da je ovo testirano i radi.**
Vidi arhitektonsku odluku "OCR: vanjska vs. unutarnja strana prometne"
niže za pun opis. Ukratko:
- **VIN fix (unutarnja strana):** stari `matchVin` je hvatao PRVI tekst
  nakon EU šifre "E", bez validacije da li stvarno izgleda kao VIN - ako
  dokument ima legendu koja objašnjava šifre PRIJE stvarne tablice
  vrijednosti (npr. "E - Identifikacijski broj vozila" prije retka s pravim
  VIN-om), `matchByCode` bi pogrešno vratio tekst legende jer je prvi
  pogodak, i fallback `matchVin` se nikad ne bi ni pokušao (kratko-spojena
  logika `matchByCode(...) ?? matchVin(...)`). Novi `findCodeValueWindows`
  helper prolazi kroz SVAKU pojavu šifre "E" (ne samo prvu) i validira
  svaki kandidat protiv strogog VIN regexa (17 znakova, bez I/O/Q) prije
  prihvaćanja - legenda se sad preskače jer njen tekst ne prolazi
  validaciju, petlja nastavlja na sljedeću pojavu. Isti obrazac primijenjen
  i na tablice. Regresija-testirano sintetičkim primjerom koji reproducira
  točno taj legenda-prije-vrijednosti scenarij (vidi bug #41 niže).
- **Ekstrakcija tablica maknuta s unutarnje strane potpuno** - ta strana ih
  nikad ne sadrži (korisnikova napomena).
- **Novi endpoint za vanjsku stranu** (`/api/ocr/registration-doc-outer`,
  novi `extractRegistrationOuterFields`) - cilj isključivo registracijska
  oznaka, format-baziran pristup (ne label-baziran) jer je tablica na toj
  strani standardno prikazana veliko i jasno bez potrebe za oslanjanjem na
  točan raspored koda - Claude je bio transparentan da nema potvrđeno
  znanje o točnom OCR tekstualnom rasporedu vanjske strane i predložio ovaj
  pristup kao prvi prolaz, korisnik nije tražio referentnu sliku prije
  nastavka.
- Stari jedinstveni `/api/ocr/registration-doc` endpoint i `extractRegistrationFields`/
  `extractRegistrationDocFromImage` funkcije uklonjeni (zamijenjeni s
  `-inner`/`-outer` parovima), nema backward-compat sloja (mlada
  funkcionalnost, nema postojećih podataka koji bi ovisili o starom obliku).
- UI: oba slota (`/vehicles/new`, `/vehicles/[id]` dokumenti tab) sad imaju
  odvojen upload input + "Skeniraj i prefilaj" gumb, s jasnom `→ polje`
  caption ispod svakog ("Vanjska strana → registracija (tablice)" /
  "Unutarnja strana → marka/model/VIN"). Polica osiguranja dobila istu
  caption konvenciju ("→ datum isteka registracije (OCR dolazi u idućem
  koraku)") - čisto label, bez nefunkcionalnog gumba, da UI ne obećava
  nešto što još ne radi.
- Verifikacija: `tsc --noEmit` čist na oba paketa, `next build` čist (nove
  rute vidljive, stara uklonjena iz outputa), regex logika
  sanity-testirana s 5 sintetičkih scenarija uklj. legenda-prije-vrijednosti
  (vidi bug #41). **Nije testirano protiv stvarnih slika** - čeka
  korisnikovu sljedeću rundu s pravim fotografijama obje strane prometne.
  Nije commitano/pushano - čeka korisnikovu potvrdu.

**Prijašnji dio iste sesije (sedmi/osmi nastavak) - bug #40 (owner web
login loop) potpuno riješen, u dva sloja.** Prvi sloj (kod, vidi bug #40
niže za pun dokazni lanac - Vercel logs, deploy provjera, izravno cookie
mjerenje kroz Browser Pane): redirect fallback promijenjen s fiksne env
varijable na stvarni request origin, commitano i pushano (`39ec9f2`).
**Drugi sloj, otkriven kad je korisnik prijavio da fix "još ne radi" na
NOVOM zahtjevu** (svjež magic link je vodio na `localhost:3000`) - korisnik
je ispravno posumnjao da je "Site URL" u Supabase dashboardu (izvan
koda/gita) i dalje `http://localhost:3000`. Potvrđeno **izravnim mjerenjem,
ne pretpostavkom**: `supabase.auth.admin.generateLink()` s eksplicitnim
`redirectTo` za `-ten` domenu vratio je stvarni `action_link` s
`redirect_to=http://localhost:3000` - GoTrue tiho ZAMIJENI redirectTo sa
Site URL kad redirectTo nije na allowlisti, bez greške pozivatelju. **Ovo
je obezvrijedilo raniji zaključak "Supabase allowlista ima permisivan
wildcard"** iz prvog kruga bug #40 dijagnoze - taj je zaključak bio
POGREŠAN (izveden iz `signInWithOtp`-ovog `error` polja, koje ne
odražava je li redirectTo stvarno prihvaćen ili tiho zamijenjen). Korisnik
je ručno promijenio Site URL na
`https://fleet-manager-web-branimir-s-projects1.vercel.app` i dodao
`https://fleet-manager-web-ten.vercel.app/**` u Redirect URLs allowlistu
(Authentication → URL Configuration). Ponovljen `generateLink` test nakon
promjene - sve tri ciljne domene (`-ten`, `-branimir-s-projects1`, mobile
`rentacarmanager://`) sad vraćaju ispravan `redirect_to`. **Stvaran
magic-link klik nakon ovoga nije potvrđen u chatu** - korisnik je prešao
na sljedeći zadatak (OCR redizajn) prije potvrde, treba zatražiti kad se
vrati na temu.

**Prijašnji dio iste sesije (šesti nastavak) - započet Tier 2 backlog.
Prva stavka gotova: **OCR ekstrakcija podataka s prometne dozvole** (Google
Cloud Vision REST API, `GOOGLE_VISION_API_KEY` već postojao u `.env`).
Novi `packages/api/src/ocr/` modul (`vision.ts` - goli `fetch` na
`images:annotate` s `DOCUMENT_TEXT_DETECTION`, bez `@google-cloud/vision`
SDK-a jer taj očekuje service-account JSON, ne API key;
`extractRegistrationDoc.ts` - regex ekstrakcija marke/modela/tablica/VIN-a
iz OCR teksta, prvo pokušava harmonizirane EU šifre polja prometne dozvole
D.1/D.3/A/E, fallback na generičke regexe za hrvatsku tablicu i VIN format
ako šifre nisu prepoznate). Nova ruta `POST /api/ocr/registration-doc`
(auth-zaštićena, standalone - ne zahtijeva postojeći `vehicleId` jer radi i
na "Novo vozilo" formi prije nego vozilo uopće postoji), NE sprema ništa,
samo vraća prijedlog polja. UI: gumb "Skeniraj prometnu (OCR)" na
`/vehicles/new` i "Skeniraj (OCR)" na `/vehicles/[id]` dokumenti tabu (kraj
postojećeg uploada prometne) - prefila marka/model/tablice/VIN state,
korisnik uvijek pregleda i ručno klikne "Spremi" (ništa se ne sprema
automatski iz OCR-a). **NAMJERNO ne vadi datum isteka registracije** -
korisnikova eksplicitna napomena da je taj datum na prometnoj često
prekriven pečatom, pouzdaniji izvor je polica osiguranja (sljedeća Tier 2
stavka, PDF text-parsing, još nije rađena). Verifikacija: `tsc --noEmit`
čist na `packages/api` i `apps/web`, `next build` čist (nova ruta
`/api/ocr/registration-doc` vidljiva u build outputu), `curl` bez sesije
potvrđuje 401 (auth gate radi), regex ekstrakcija sanity-testirana protiv
sintetičkog OCR teksta u oba formata (šifra+vrijednost isti red, šifra pa
vrijednost sljedeći red) - **NIJE testirano protiv stvarnog Google Vision
API poziva ni stvarne slike prometne** (nema test slike, a pravi owner
login kroz Browser Pane je prije eksplicitno ocijenjen preskupim za ovaj
tip promjene - vidi dopunu 2026-08-19 niže). Prva prava upotreba na
stvarnoj prometnoj otkrit će treba li regex fino podesiti. Preostaje u
Tier 2: PDF text-parsing police osiguranja (datum isteka registracije),
opcionalni OCR za osobnu/vozačku, generator punomoći za registraciju.

**Prijašnji dio iste sesije (četvrti nastavak):** bug #37 fix (direct-
to-storage upload) je i dalje pucao na pravom uređaju, sad kod PUT koraka.
Pravi uzrok: Hetzner bucket nije imao NIKAKVU CORS konfiguraciju, pa je
svaki cross-origin PUT iz pravog browsera bio blokiran (server-to-server
testovi iz prijašnje verifikacije - curl, Node fetch - ne provode CORS pa
su lažno prošli). Reproducirano i potvrđeno izravno kroz Claude Browser
Pane (pravi Chromium, stvaran production origin) - uhvaćena točna
CORS greška u konzoli. Fix: CORS politika postavljena na bucket (dva
pokušaja - uska politika je popravila OPTIONS preflight ali ne i stvaran
PUT odgovor, šira politika je popravila oboje, potvrđeno ponovljenim
real-browser testom). Perzistirano kao maintained script
(`packages/api/scripts/configure-hetzner-cors.mjs`) jer je ovo bucket-level
konfiguracija izvan gitanog koda. Vidi bug #38 za pun dokazni lanac.
Detalji ispod su iz PRIJAŠNJEG (nedovoljnog) kruga verifikacije - ostavljeno
netaknuto radi kronologije, ali pouka iz bug #38 primjenjuje se ubuduće:
server-to-server test nije dovoljan za browser-facing cross-origin flow.

**Prijašnji dio iste sesije (treći nastavak):** korisnik
prijavio da su OBA "riješena" bugova iz prijašnjeg dijela sesije zapravo
i dalje bila pokvarena na stvarnom uređaju, eksplicitno tražio da se ovaj
put ne zaključuje "vjerojatno" nego dokaže izravnim mjerenjem prije prijave
fixa. Oba su bila stvarni, ozbiljniji problemi nego prijašnja dijagnoza:
**(A) Bug #36 (angle-grid) fix je bio potpuno ispravan, ali NIKAD deployan**
- cijela sesija (i prijašnje sesije unatrag do 16.08.) je sjedila lokalno,
necommitano. Dokazano fetchanjem stvarnog production CSS bundlea (nema
`640px` u njemu). Riješeno: sve je commitano (jedan commit, vidi git log)
i pushano (`git push` je prošao kroz auto-mode classifier tek nakon što je
korisnik odobrio u chatu - Claude ne smije sam zaobići taj gate). **(B) Bug
#37 - signing submit s DRUGIM emailom i dalje pada.** Prijašnja dijagnoza
(shared owner/client email, vidi ograničenje #9) je bila pogrešna -
ispravljeno. Pravi uzrok, dokazan `vercel logs` uvidom (0 POST /api/sign
poziva u 24h unatoč dovršenom wizardu) + izravnim `curl` protiv produkcije
(potvrđen `413 FUNCTION_PAYLOAD_TOO_LARGE`, stvaran odgovor ne
pretpostavka): Vercelov tvrdi ~4.5MB limit za tijelo Serverless Function
zahtjeva, probijen kad se dokumenti + 4 obavezna kuta + oštećenja zbroje
čak i nakon postojeće client-side kompresije. **Fix: signing wizard
prebačen na direct-to-storage upload** - klijent uploada svaki fajl
izravno u Hetzner preko presigned PUT URL-a (novi `POST /api/sign/[token]/
upload-url` endpoint) čim ga odabere, finalni submit šalje samo malen JSON
s ključevima (ne više multipart s binarnim sadržajem) - platformski limit
više nije relevantan. Verificirano PRAVIM end-to-end testom protiv
stvarnog Hetznera (scratch Node skripta, ne browser - file input se ne
može popuniti programatski kroz dostupne alate): upload 7 stvarnih
fajlova, finalni submit `{"ok":true}`, DB potvrđuje `status: "signed"` +
5 HandoverPhoto redaka + PDF-ovi generirani, presigned download URL
potvrđuje da je fajl stvarno u Hetzneru (ne samo da je upload vratio 200).
Test podaci obrisani nakon verifikacije. `tsc --noEmit` i `next build`
čisti. Vidi bugove #36 (dodatak) i #37 za pun dokazni lanac, i
ograničenje #9 (dodatak) za ispravak prijašnjeg pogrešnog zaključka.
`/request-photos/[token]` dijeli isti rizik (manji, bez dokumenata) ali
nije popravljen ovom sesijom.

**Prijašnji dio iste sesije (potvrda prije ispravka):** (1) Potvrđeno i popravljeno: `pricePerDay` je sad stvarno obavezno
polje (pozitivan broj) na kreiranju ugovora, i na webu i na mobileu -
mobile input za `pricePerDay`/`excessAmount`/`paymentMethod`/`pickupLocation`/
`odometerStart` uopće nije postojao prije ove sesije, dodan. (2) Bug #35 -
prvi EAS cloud preview build se rušio na pokretanju jer `apps/mobile/.env`
(gitignored) nije dostupan cloud build VM-u; fix je `env` blok u sva tri
`eas.json` profila, potvrđen novim buildom. (3) Vehicle detail ekran
(`/vehicles/[id]` web, `owner/vehicles/[id].tsx` mobile) restrukturiran u
kartice/tabove (Podaci o vozilu / Dokumenti / Slike vozila / Servisna
knjižica-placeholder / Ugovori), na oba app-a podjednako - vidi modul 2
dodatak niže. Nova "Ugovori" kartica uvela je pravu potrebu za čitljivim
brojem ugovora: dodan `Contract.number` (autoincrement Int, odvojen od cuid
`id`-a), migracija je retroaktivno numerirala svih 16 postojećih test
ugovora po `createdAt` redoslijedu (potvrđeno upitom, brojevi 1-16 čisto
uzlazno) - PDF-ovi (Contract/Protocol/Annex) i UI popisi sad prikazuju
`number` umjesto sirovog `id`-a. (4) Bug #36 - `.angle-grid` CSS (4 kuta
slikanja vozila u signing/photo-request wizardu) nije imao responsive
breakpoint, uvijek 2 kolone čak i na uskim mobilnim širinama - dodan
`@media (max-width: 640px)` u `globals.css`, potvrđeno računanjem stvarnog
`getComputedStyle` u Browser Paneu (375px → 1 kolona, 1280px → 2 kolone
nepromijenjeno). (5) Dijagnoza (BEZ promjene koda, korisnik eksplicitno
tražio uzrok prije ikakve promjene) prijavljenog "ugovor se ne šalje
mailom" - vidi poznato ograničenje #9 dodatak, zaključak: DB pokazuje da je
mail flow stvarno uspio (status `sent`, valjan nepotpisan token), uzrok je
potvrđeno isti dijeljeni owner/client testni email, NE stvaran bug.
Verifikacija za (1)-(4): `tsc --noEmit` čist na sva tri paketa, `next
build` uspješan, `expo export` čist, migracija primijenjena i backfill
potvrđen upitom nad produkcijskom bazom, CSS fix vizualno potvrđen u
Browser Paneu preko stvarnog (nepotpisanog, još valjanog) signing tokena iz
baze. Owner-auth-zaštićene stranice (vehicle detail tabovi) nisu testirane
kroz pravi login klik ovom sesijom - isti razlog kao prijašnje sesije
(PKCE/magic-link browser test trošio previše vremena, standardna
typecheck+build+bundle verifikacija prihvaćena kao dovoljna za ovaj tip
promjene).

Prijašnja sesija: redizajn Contract PDF-a po uzoru na stvaran referentni
ugovor (korisnikov postojeći taxi/rent-a-car dokument, korišten samo za
layout/format polja, podaci klijenta iz njega nisu nigdje reproducirani) +
novi scroll-to-accept korak za uvjete najma u signing wizardu. Novo:
`Client.address`, `Contract.pickupLocation/returnLocation/odometerStart/
odometerEnd/pricePerDay/excessAmount/paymentMethod/termsAcceptedAt/
termsVersion` (svi nullable, migracija primijenjena), novi `COMPANY_*` env
vars za PDF zaglavlje. Usput otkriven i popravljen bug #34 - react-pdf-ov
default font briše č/ć (šire nego ranije dokumentirani "samo đ" bug #12),
popravljeno embeddanim PT Sans fontom, primijenjeno globalno pa je fix
pokrio i Protocol/Annex PDF-ove. Prije toga: Tier 1 backlog (padajući
izbornici marka/model/godina, brzi odabir početka najma, auto-računanje
datuma povrata, `DD.MM.GGGG.` format svugdje - vidi modul 2 sekciju), i
prije toga moduli 1-6, 8, registracije/police osiguranja, modul 7 (mobile,
obje faze), modul 3 dodaci (portret upload fix + prijava oštećenja,
bugovi #30-#32).

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
| 7 | Mobile appovi (owner-mobile, client-mobile) | 🔶 **Faza 1 (auth + skeleton) gotova, testirano uživo na uređaju. Faza 2 (owner-mobile feature ekrani) kodno gotova, čeka live test na uređaju** |

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

**Naknadna sesija — UX brzina unosa (backlog Tier 1, vidi sekciju 7):**
- Marka/model/godina na formi vozila (`/vehicles/new`, `/vehicles/[id]`) su
  sad padajući izbornici umjesto slobodnog teksta - statička lista
  (`packages/api/src/data/vehicleCatalog.ts`, `VEHICLE_MAKES` +
  `VEHICLE_MODELS_BY_MAKE`, ~32 marke, po 5-10 modela svaka, fokus na
  vozila realna za HR/EU rent-a-car flotu). Model-popis se cascadira po
  odabranoj marki. "Ostalo" opcija na oba (marka i model, neovisno) otvara
  slobodni tekstualni unos - nužno jer statička lista nikad neće pokriti
  baš svaki slučaj, i da postojeći uneseni podaci (prije ove promjene) ne
  budu izgubljeni ako ne postoje na listi (edit forma to detektira i pada
  natrag na custom način automatski).
- Kreiranje ugovora (`/contracts/new`): početak najma preko "Danas"/
  "Sutra"/"Custom" brzih gumba (Custom otkriva native `type=date` input),
  umjesto uvijek ručnog upisa. Datum povrata više nije ručni input - novi
  "Trajanje najma (broj dana)" numerički input automatski računa i
  prikazuje datum povrata (read-only, `formatDateHr`). Submit i dalje šalje
  ISO `dateFrom`/`dateTo` na nepromijenjeni `/api/contracts` endpoint - cijela
  promjena je čisto na UI razini.
- **Svi datumi koje korisnik VIDI (ne unosi preko native pickera) su sad
  striktno `DD.MM.GGGG.` format** (hrvatski standard, s točkom na kraju) -
  novi `formatDateHr`/`parseHrDateToIso`/`isoToHrDate` helperi u
  `packages/api/src/lib/dateFormat.ts`, dijeljeni između weba i mobilea
  (čista logika, bez server ovisnosti - isti obrazac kao zod scheme).
  Namjerno NE koristi `Intl`/`toLocaleDateString("hr-HR")` jer taj default
  ubacuje razmake ("19. 08. 2026.", CLDR hr-HR konvencija) - korisnik je
  eksplicitno tražio bez razmaka. Native `<input type="date">` na webu
  ostaje netaknut (HTML5 spec zahtijeva ISO vrijednost, browser sam
  lokalizira vizualni prikaz pickera - nije nešto što aplikacija kontrolira
  niti treba mijenjati). Mobile GGGG-MM-DD tekstualni inputi (dokumentirano
  ograničenje - nema native date pickera, vidi modul 7 fazu 1) zamijenjeni
  DD.MM.GGGG. formatom + `parseHrDateToIso` validacijom i jasnom porukom
  na krivi unos.

**Naknadna sesija — vehicle detail ekran restrukturiran u kartice (tabove).**
`/vehicles/[id]` (web) i `owner/vehicles/[id].tsx` (mobile) su prije bili
jedan dugi scrollable ekran - sad su 5 kartica: "Podaci o vozilu" (postojeća
forma, nepromijenjena), "Dokumenti" (prometna + polica, premješteno bez
promjene logike), "Slike vozila" (galerija, premješteno), "Servisna
knjižica" (NOVO, čist placeholder tekst "uskoro" - stvarna funkcionalnost
je Tier 4 backlog), "Ugovori" (NOVO). Implementirano kao lokalni tab state
(`activeTab`) + uvjetni render postojećih blokova - svi handleri/upload
handlovi ostali su potpuno nepromijenjeni, samo je JSX omotan u
`{activeTab === "x" && (...)}`. "Ugovori" kartica fetcha SVE ugovore
(postojeći `/api/contracts` na webu, `listContracts()` na mobileu) i
filtrira client-side po `vehicleId` - namjerno bez novog
`/api/vehicles/[id]/contracts` endpointa, konzistentno s ostatkom app-a
(nigdje se ne paginira/server-side filtrira, flota je mala). Prikazuje broj
ugovora (`Contract.number`, vidi arhitektonsku odluku niže), datume, status,
klijenta, i link na `contractPdfUrl` (presigned, ista URL-generacija kao
svugdje drugdje).

### Modul 3 — Public signing flow
`/sign/[token]`. Jednoekranski wizard: upload vozačke/osobne + telefon →
4 obavezna kuta slikanja (front/back/left/right) + opis oštećenja po slici →
canvas potpis → jedan finalni submit koji sve šalje odjednom (ne upload po
koraku — izbjegava djelomično stanje u bazi). Vidi bugove #8, #9.

**Naknadna sesija (nakon što je modul već bio proglašen gotovim):** bug fix
za portret-only upload failure (bug #30) + nova funkcija prijave oštećenja
po dijelu vozila. Vidi bug #30 i arhitektonsku odluku "Strukturirano polje
za dio vozila" niže za detalje. Ukratko:
- Sva 4 file inputa (vozačka, osobna, 4 obavezna kuta, sad i dodatne slike
  oštećenja) prolaze kroz `compressImageFile()`
  (`apps/web/src/lib/compressImage.ts`) prije nego se stave u state - canvas
  downscale na max 1920px duljoj stranici + JPEG re-encode kvalitete 0.82,
  prije nego korisnik uopće klikne submit.
- Novi "Oštećenja (opcionalno)" blok u photos koraku - dinamički popis
  (`useState<DamageEntry[]>`), svaki unos: dio vozila (select, 27 opcija),
  slika (`capture="environment"`), opis (opcionalno). "+ Dodaj još jedno
  oštećenje" / "Ukloni oštećenje" po unosu. `photosComplete` sad zahtijeva
  i da je svaki započeti damage unos kompletan (dio + slika) prije "Dalje".
  Submit šalje `damageCount` + indeksirane `damage_${i}_part/photo/
  description` ključeve (broj oštećenja nije fiksan, za razliku od 4
  obavezna kuta).

**Sljedeća sesija — novi "terms" korak (scroll-to-accept uvjeta najma) prije
potpisa.** `STEPS` niz: `documents → photos → terms → signature → review`.
Scrollable box (`.terms-box`, fiksna visina 260px, `overflow-y: auto`) s
placeholder tekstom uvjeta (8 generičkih klauzula - pravi pravni tekst
dolazi naknadno, vidi `TERMS_VERSION`/`TERMS_TEXT` konstante u
`sign/[token]/page.tsx`, komentar upozorava da se `TERMS_VERSION` MORA
promijeniti kad se tekst zamijeni). `onScroll` handler otključava checkbox
tek kad `scrollTop + clientHeight >= scrollHeight - 10` (10px tolerancija
za zaokruživanje). "Dalje" ostaje disabled dok checkbox nije čekiran.
Prihvaćanje se šalje kao `termsAccepted=true` + `termsVersion` u FormData;
**server (ne klijent) postavlja `Contract.termsAcceptedAt = new Date()`**
u `completeSigning` transakciji - pouzdaniji zapis "kad je stvarno
primljeno" nego klijentski timestamp. `/api/sign/[token]` route odbija
submit s `terms_not_accepted` ako `termsAccepted !== "true"`.
Dodano usput: `address` polje na documents koraku (opcionalno, sprema se u
`Client.address` u istoj `prisma.client.update` gdje se već ažurira
`phone`).

### Modul 4 — PDF + storage
`packages/api/src/pdf/` — `ContractPdf.tsx`, `ProtocolPdf.tsx`,
`AnnexPdf.tsx` (dodan u modulu 5), `components.tsx` (cast wrapper za
react-pdf komponente, vidi bug #10), `generate.tsx`, `styles.ts`,
`format.ts`. Generira se nakon potpisa, upload na Hetzner, mail objema
stranama s PDF prilozima. Best-effort — greška u PDF/mail koraku ne ruši
već spremljen potpis (try/catch, `console.error`). Vidi bugove #10, #11, #12.

**Naknadna sesija — redizajn Contract PDF-a po uzoru na referentni primjer
(korisnik priložio stvarni ugovor iz vlastitog taxi/rent-a-car poslovanja
kao format-referencu - korišten SAMO za layout/strukturu polja, stvarni
podaci klijenta iz tog dokumenta nisu nigdje reproducirani, ni u kodu ni u
test podacima).** Novi izgled: zaglavlje (company blok lijevo iz novih
`COMPANY_*` env varijabli + kutija s brojem ugovora desno), "Račun za /
Korisnik" blok (ime, adresa, OIB), tablica "Podaci o najmu" (registracija,
vozilo, preuzimanje/povrat s datumom+vremenom+lokacijom, kilometraža
početak/kraj, broj dana, cijena/dan, ukupno), tablica "Obračun" (ukupno,
PDV 25%, osnovica, učešće u šteti, način plaćanja - PDV/osnovica/ukupno se
RAČUNAJU iz `pricePerDay × broj dana`, ne spremaju se kao zasebna polja),
dvojezični (HR/EN) blok upozorenja o pozivu policije kod nezgode, red o
prihvaćanju uvjeta najma (vidi modul 3 dodatak), i dvostupčani potpisni
blok. Vidi bug #34 (font) i arhitektonsku odluku "Koja polja su dodana i
gdje se unose" za detalje o novim Contract/Client poljima.

**Bug #34 otkriven usput, tijekom vizualne provjere redizajna** — react-pdf
default Helvetica font (WinAnsi/CP1252 enkodiranje) tiho briše č/ć iz
teksta (ima š/ž, nema č/ć/đ), šire nego što je bug #12 ranije dokumentirao
(bug #12 je testirao samo đ). Popravljeno embeddanjem PT Sans fonta kao
base64 data URI (`packages/api/src/pdf/fonts.ts`, `Font.register`) -
namjerno NE kao odvojeni `.ttf` fajl na disku, da se izbjegne isti razred
problema kao bug #23 (Next.js file tracer preskače binarne assete iz
serverless bundlea). Primijenjeno globalno kroz `styles.ts` (svi
`fontFamily: "Helvetica"/"Helvetica-Bold"` → `"PTSans"` + `fontWeight`), pa
je fix automatski popravio i ProtocolPdf/AnnexPdf, ne samo Contract PDF.
Bug #12-ova ograničenja #1 (poznata ograničenja, niže) je stoga zastarjelo
- ažurirano.

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

### Modul 7 — Faza 2: owner-mobile feature ekrani (kodno gotovo, čeka live test)

Nastavak na gotov auth skeleton iz faze 1. Sve backend rute su već postojale
(reused bez izmjena osim jednog bug fixa — vidi bug #29 niže) i rade preko
istog Bearer-token mehanizma generaliziranog u fazi 1, pa je ovo čisto
UI/navigacijski posao.

**Novi ekrani** (`apps/mobile/app/owner/`), svi unutar postojećeg
`owner/_layout.tsx` Stack-a (auth-gated, `headerShown: false` — svaki ekran
ima svoj ručni "< Natrag" link, isti obrazac kao `verify-code.tsx` iz faze 1,
umjesto native headera):
- `home.tsx` — prepravljen iz faze-1 smoke-testa u pravi dashboard: 3 gumba
  (Vozila/Klijenti/Ugovori) + odjava.
- `vehicles/index.tsx` — lista vozila (`GET /api/vehicles`), tap → detalj.
  `useFocusEffect` (re-exportiran iz `expo-router`, potvrđeno u
  `expo-router/build/exports.js` prije upotrebe — nije direktna ovisnost
  `@react-navigation/native` na mobileu, koja pod pnpm strict izolacijom ne
  bi bila resolvable) osigurava refresh liste pri povratku s detalja, jer
  Expo Router (native-stack) drži prijašnje ekrane mountane u memoriji —
  goli `useEffect(() => {}, [])` ne bi uhvatio promjene napravljene na
  detalju.
- `vehicles/[id].tsx` — uređivanje podataka (marka/model/godina/tablice/VIN/
  datum isteka registracije kao tekstualni GGGG-MM-DD unos, bez native date
  pickera — vidi arhitektonsku odluku niže), upload prometne/police
  osiguranja (`expo-document-picker`, `type: ["image/*", "application/pdf"]`)
  i slika vozila (`expo-image-picker`, `launchImageLibraryAsync` s
  `allowsMultipleSelection: true`), brisanje pojedine slike.
- `clients/index.tsx` — lista klijenata + obrazac za dodavanje (isti
  validacijski uvjeti kao web: OIB regex 11 znamenki client-side prije
  submita, backend zod shema je ionako izvor istine).
- `contracts/index.tsx` — lista ugovora s vozilom/klijentom/datumima/
  statusom, gumb "Zatraži slike" za aktivne potpisane ugovore bez već
  poslanog nepodmirenog zahtjeva (identična `isActive()` logika kao web
  `contracts/page.tsx`, duplicirana lokalno).
- `contracts/new.tsx` — kreiranje ugovora: vozilo i klijent biraju se kao
  pressable redci u listi (nema native picker/select komponente u RN-u bez
  dodatne ovisnosti), datumi kao GGGG-MM-DD tekstualni unos.

**Nove ovisnosti:** `expo-image-picker`, `expo-document-picker` — dodane
preko `expo install` (ne golog `pnpm add`) da se dobiju točne SDK 57
kompatibilne verzije. Oba su službeni Expo SDK moduli **uključeni u
precompilirani Expo Go binary** (za razliku od npr.
`@react-native-community/datetimepicker`), pa rade odmah u Expo Go bez
ponovnog native builda — namjerno izbjegnuto zbog cijele Windows CMake/ninja
sage iz bugova #18-19, koja bi se ponovila za bilo koju ovisnost koja
zahtijeva `expo prebuild`/custom dev client.

**Verifikacija napravljena bez uređaja** (isti razlog kao faza 1 — Claude
Browser Pane ne prikazuje Expo app): `tsc --noEmit` čisto na `apps/mobile`,
`npx expo export --platform ios` uspješno izbundlao 1176 modula (raslo s
1164 u fazi 1, očekivano s dvije nove ovisnosti + 6 novih ekrana).

**Ostaje prije nego se faza 2 proglasi gotovom:** live test na uređaju —
navigacija kroz sva 4 nova ekrana, kreiranje ugovora i provjera da mail za
potpis stigne klijentu identično kao s weba. Upload prometne/police/slika je
prvim live testom otkrio bug #30 (popravljeno, prebačeno na
`expo-file-system` `File.upload()`) i usput bug #31 (tipkovnica prekrivala
formu, popravljeno svugdje) — oba fixa su čisto JS-side i nisu zahtijevala
novi dev-client build, ali **re-test na uređaju nakon ovih fixeva još nije
potvrđen**.

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

28. ⚠️ **Potvrđeno: bug #27-ova sumnja bila je točna, i riješeno prebacivanjem
    na OTP kod umjesto magic-link deep linka.** Korisnik prijavio točnu
    poruku "App nije primio link iz maila" - stuck timer na
    `waiting_for_url` stageu, znači deep link NIKAD nije stigao do appa.
    Dijagnosticirano izravnim pozivom na Supabase-ov `verify` endpoint
    (preko `admin.generateLink` + ručni `curl` na `action_link`): server
    strana je bila potpuno ispravna cijelo vrijeme -
    `rentacarmanager://**` JEST na redirect URL allowlisti, Supabase šalje
    ispravan `303 See Other` s `Location: rentacarmanager://auth-callback
    #access_token=...&refresh_token=...`. Problem je isključivo u tome što
    mnogi mail klijenti (Gmail app i sl.) otvaraju linkove u in-app
    browseru koji iz sigurnosnih razloga blokira automatski redirect na
    non-http(s) custom scheme - app se nikad ne pokuša otvoriti, OS ne
    dobije priliku ponuditi "otvori u aplikaciji".
    **Odluka (korisnik potvrdio, birano između OTP koda / Universal Links
    / uputa za ručno otvaranje u browseru):** OTP kod - potpuno izbjegava
    deep-linking, pouzdano radi neovisno o mail klijentu. Universal Links
    bi bio "pravi" fix ali zahtijeva hosting verifikacijskih fajlova +
    app.json promjene + NOVI native dev-client build (cijela Windows CMake
    saga iz bugova #18-19 ponovno).
    **Implementacija:**
    - `apps/mobile/app/verify-code.tsx` (nova ruta) - text input za
      6-znamenkasti kod, poziva `supabase.auth.verifyOtp({email, token:
      code, type: "email"})` izravno (klijentski Supabase poziv, bez
      backend poziva).
    - `apps/mobile/app/check-email.tsx` obrisan, zamijenjen s
      `verify-code.tsx` - `login.tsx` sad navigira na
      `/verify-code` s `email` kao route paramom (`useLocalSearchParams`)
      umjesto na statičan "provjeri poštu" ekran.
    - `auth-callback.tsx` (deep-link ruta) NIJE uklonjen - ostaje kao
      besplatan fallback ako link ipak negdje uspije (npr. otvoren u
      pravom sistemskom browseru), samo više nije primarni put.
    - `type: "email"` (ne `"magiclink"`) je ključan za `verifyOtp` kod
      brojčanog koda - potvrđeno prije implementacije, kriv `type` bi
      dao validation error.
    **Preostaje korisnikova akcija (Supabase dashboard):** magic-link
    email template mora sadržavati `{{ .Token }}` da se kod uopće pošalje
    u mailu - trenutno šalje samo `{{ .ConfirmationURL }}` (link). Dodati
    `{{ .Token }}` NE uklanja postojeći link (web i dalje koristi
    `{{ .ConfirmationURL }}` neovisno), samo dodaje vidljiv kod u isti
    mail. Bez ove promjene, mobile korisnik neće imati što upisati.

    **✅ Korisnik dodao `{{ .Token }}` u template, ispravio i sitan bug
    (kod stvarno ima 8 znamenki, ekran je dopuštao samo 6 -
    `maxLength`/gumb-gate ispravljeni) i potvrdio: cijeli flow radi
    end-to-end na pravom uređaju.** Login → email s kodom → unos koda →
    `verifyOtp` → role resolve → `owner/home` prikazuje pravi broj vozila
    iz baze (bearer-token `GET /api/vehicles` poziv) → logout. Modul 7
    Faza 1 (auth + skeleton) je time stvarno gotova, ne samo kodno.

29. ⚠️ **`apiFetch` bi pokvario svaki multipart upload čim bi se prvi
    pozvao** (otkriveno kod pisanja modula 7 faze 2, prije ijednog live
    testa — nije bio pogođen fazom 1 jer ona nema nijedan upload poziv).
    Postojeći kod je bezuvjetno postavljao `Content-Type: application/json`
    čim je `init.body` postojao, bez provjere je li to tijelo zapravo
    `FormData`. Pravi multipart zahtjev treba `Content-Type:
    multipart/form-data; boundary=...` koji `fetch` sam generira SAMO ako
    header nije eksplicitno postavljen - naš json header bi ga pregazio, pa
    bi svaki upload (prometna, polica, slike vozila) server dočekao kao
    tijelo bez ijednog fajla. **Fix:** `apps/mobile/src/lib/api.ts` `apiFetch`
    sad provjerava `!(init.body instanceof FormData)` prije postavljanja
    json Content-Typea.

30. ⚠️ **Prvi live test na uređaju nakon rebuilda (bug #29 fix primijenjen):
    upload police osiguranja pukao s `"Unsupported FormDataPart
    implementation"`** (isti kod put kao prometna/slike vozila - potvrđeno
    da bi se ponovilo za sve tri). Bug #29-ov fix (skip json Content-Typea
    za FormData tijela) je bio ispravan, ali nedovoljan - pravi uzrok je
    dublji: **Expo SDK 57-ov `fetch()`/`FormData` sloj na Androidu ne
    prepoznaje RN-ov klasični `{ uri, name, type }` file-part oblik** koji
    smo appendali (`formData.append("file", { uri, name, type })`, standardni
    RN obrazac dokumentiran u samom `FormData.js` izvoru). Istraženo -
    dokumentiran, otvoren Expo issue (`expo/expo#33134`) s identičnom
    porukom, potvrđuje da je ovo poznat SDK-57-eran problem, ne greška u
    našem kodu. Pokušaj lociranja točnog internog uzroka (je li global
    `fetch` u ovoj SDK verziji tiho zamijenjen Expo-ovim WinterTC-
    kompatibilnim fetch/FormData slojem umjesto RN-ovog klasičnog
    `NetworkingModule`-a) nije dovršen - nije bilo dovoljno da se izvor
    definitivno locira (samo `.d.ts` tipovi vidljivi u `expo/build/winter/`,
    stvarna implementacija je native/JSI, ne JS-require-abilna).
    **Fix (izbjegava cijelu klasu problema, umjesto lova na točan uzrok):**
    prebačeno s `fetch()` + `FormData` na **`expo-file-system`-ov
    `File.upload()`** za sva tri upload poziva (prometna, polica, slike
    vozila) - taj API gradi multipart tijelo izravno u native kodu, mimo
    fetch()-a i RN-ovog FormData mosta u potpunosti, pa je imun na ovaj
    problem po dizajnu. **Napomena o SDK 57 promjeni** (AGENTS.md upozorenje
    "Expo HAS CHANGED" potvrđeno na djelu): stari `FileSystem.uploadAsync()`
    je deprecated u ovoj verziji, nova API je `new File(uri).upload(url,
    { uploadType: UploadType.MULTIPART, fieldName, httpMethod, mimeType,
    headers, signal })` → vraća `{ status, body, headers }` (body kao
    string, treba ručni `JSON.parse`). Provjereno prije pisanja koda kroz
    trenutne verzionirane docs (`docs.expo.dev/versions/v57.0.0/sdk/
    filesystem/`), ne iz starijeg znanja.
    - `apps/mobile/src/lib/api.ts` - novi `uploadPickedFile<T>()` helper
      (Bearer token iz Supabase sesije, 30s timeout preko `AbortController`
      + `signal` opcija koju `File.upload()` podržava, isti error-body
      parsing obrazac kao `apiFetch`). `uploadVehicleRegistrationDoc`/
      `uploadVehicleInsurancePolicy` sad pozivaju ovaj helper umjesto
      `apiFetch` + `FormData`.
    - `uploadVehicleImages` (multi-file) - `File.upload()` šalje samo JEDAN
      fajl po pozivu (nema multi-file multipart u ovom API-ju). Backend
      endpoint (`formData.getAll("files")`) već radi ispravno i s jednim
      elementom, pa se više odabranih slika šalje kao **paralelni pozivi**
      na isti endpoint (`Promise.all`), rezultati (svaki poziv vrati niz s
      1 slikom) se spljošte (`flat()`) u jedan niz.
    - `expo-file-system` dodan kao **eksplicitna** ovisnost
      (`apps/mobile/package.json`), pinana na `57.0.2` - točno verzija koja
      je već bila transitivno linkana u postojećem APK-u (kao ovisnost
      `expo-image-picker`/`expo-document-picker`, vidljivo u Gradle "Using
      expo modules" logu iz prethodnog builda). Zato ovaj fix **nije
      zahtijevao novi `expo run:android`** - čisto JS-side promjena, native
      kod za `expo-file-system` je već bio kompajliran u postojeći dev-
      client. `pnpm --filter mobile add expo-file-system@57.0.2
      --virtual-store-dir "C:/v"` korišten direktno umjesto `expo install`
      (koji interno zove goli `pnpm add` bez našeg custom
      `--virtual-store-dir` flaga - vidi bug #18/#19 - i puca s
      `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`).

31. **Tipkovnica prekrivala input polja i submit gumb na sva tri mobile
    obrasca s tekstualnim unosom** (`owner/clients/index.tsx` "Novi
    klijent", `owner/vehicles/[id].tsx` uređivanje podataka,
    `owner/contracts/new.tsx` datumi) - nijedan nije imao
    `KeyboardAvoidingView`, pa se sadržaj nije pomicao/skupljao kad se
    tipkovnica otvori. Prijavljeno za "Novi klijent" formu, popravljeno
    dosljedno na sva tri ekrana s istim obrascem (isti bug bi se inače
    prijavio triput). **Fix:** svaki ekran omotan u
    `KeyboardAvoidingView` (`behavior: "padding"` na iOS, `"height"` na
    Android - standardni RN obrazac za tu platform razliku), plus
    `keyboardShouldPersistTaps="handled"` na unutarnjem `FlatList`/
    `ScrollView`-u (da tap na gumb odmah radi dok je tipkovnica otvorena,
    umjesto da prvi tap samo zatvori tipkovnicu).

32. ⚠️ **Upload slika vozila u `/sign/[token]` wizardu pucao ("Greška
    prilikom slanja") kad su slike snimljene u portretu na mobitelu, radio
    je u landscapeu.** Istražen cijeli backend put (`completeSigning`,
    `uploadObject`) - nema nikakve orijentacije/aspect-ratio logike, uzrok
    NIJE bio u aplikacijskom kodu. Pravi uzrok: **Vercel-ov tvrdi platform
    limit za tijelo zahtjeva na Serverless Functions (~4.5MB) - nema
    Next.js config koji ga zaobiđe za Route Handlere.** Jedan signing submit
    šalje 6 slika odjednom (vozačka + osobna + 4 obavezna kuta), svaka
    izravno iz telefonske kamere (`<input capture="environment">`), bez
    ikakve kompresije - realne kamera-JPEG datoteke od nekoliko MB svaka
    lako preko zbroja probiju limit. Orijentacijska korelacija koju je
    korisnik prijavio nije bila slučajna - portret snimke preko `capture`
    atributa su na dosta Android uređaja (dokumentiran, poznat Chromium
    fenomen) občutno veće od landscape snimki iz iste kamere.
    **Fix:** novi `apps/web/src/lib/compressImage.ts` - canvas-based
    downscale (max 1920px na dužoj stranici) + JPEG re-encode (kvaliteta
    0.82) prije nego se ijedna slika stavi u state, primijenjeno na SVE file
    inputove u `/sign/[token]` (vozačka, osobna, 4 kuta, nove slike
    oštećenja - vidi modul 3 sekciju). Usput normalizira i EXIF rotaciju
    (canvas snima sliku uspravno onako kako je `<img>` element već prikazan,
    orijentacija se "peče" u izlazni canvas). **Potvrđeno testom:** sintetička
    12MB "portret" testna slika (3000×4000, realan omjer kao portret telefon
    snimka) kompresirana na 1440×1920 / ~1MB prije uploada - cijeli signing
    flow uspješno završen s 6 takvih slika u jednom submitu, i u portret i u
    landscape (desktop) viewportu, oba puta potvrđeno u bazi (status
    "signed", oba PDF-a generirana).

33. **Bug #3 se ponovio u novom obliku - `next build` se zaglavio čitav ranije
    bez ijedne greške, stao odmah nakon "▲ Next.js 14.2.35" bannera.**
    Provjereno preko `Get-Process`/`Get-CimInstance` (CPU vrijeme se nije
    pomicalo kroz 20s - proces stvarno stao, ne samo sporo radi) - pravi
    uzrok isti kao dokumentirani bug #3 (`.next` cache konflikt kad build i
    dev server dijele isti direktorij), samo NOVI trigger: dev server je bio
    pokrenut preko Claude Browser Pane `preview_start` alata (ne ručno u
    terminalu kao ranije), pa taj oblik pokretanja dosad nije bio povezan s
    ovim gotchom u prijašnjim bilješkama. **Fix:** `preview_stop` prije
    `pnpm turbo run build`, `rm -rf apps/web/.next`, retry - build prošao
    čisto u 25s. **Pravilo prošireno:** provjeriti/zaustaviti SVAKI aktivni
    dev server (uklj. Browser Pane preview), ne samo ručno pokrenute, prije
    bilo kojeg `build` poziva.

34. ⚠️ **react-pdf-ov default Helvetica font tiho briše č i ć iz teksta**
    ("Račun" → "Raun", "Učešće" → "Ueše") - otkriveno tijekom vizualne
    provjere redizajniranog Contract PDF-a (renderirano izravno preko
    scratch skripte, ne kroz browser/auth - vidi napomenu o metodi
    testiranja niže). Bug #12 je ranije dokumentirao SAMO đ kao pogođen
    ("Č, ć, š, ž rade ispravno") - ta tvrdnja je bila netočna/nedovoljno
    testirana; stvarni uzrok je da Helvetica u react-pdf-u koristi
    WinAnsi/CP1252 enkodiranje, koje ima š/ž (CP1252 0x8A/0x9A/0x8E/0x9E)
    ali NEMA č/ć/đ (ti znakovi su u Latin Extended-A, izvan CP1252 raspona).
    **Fix:** embeddan PT Sans font (OFL licenca, google/fonts) kao base64
    data URI u novom `packages/api/src/pdf/fonts.ts`
    (`Font.register({family: "PTSans", fonts: [...]})`), pozvano kao
    side-effect import (`import "./fonts"`) u `generate.tsx` prije prvog
    rendera. Namjerno base64-embed umjesto odvojenog `.ttf` fajla na disku -
    izbjegava rizik da Next.js-ov file tracer (`@vercel/nft`) ne prepozna
    binarni asset i preskoči ga iz serverless bundlea (identičan razred
    problema kao bug #23, Prisma query engine binary). `styles.ts` ažuriran
    globalno (svih 6 mjesta `Helvetica`/`Helvetica-Bold` → `PTSans` +
    `fontWeight`), pa fix pokriva sve PDF-ove (Contract, Protocol, Annex),
    ne samo Contract koji je bio u fokusu ove sesije. Potvrđeno vizualno:
    "Račun za / Korisnik", "Kilometraža - početak", "Obračun", "Učešće u
    šteti", "Način plaćanja", "slučaju", "će biti terećena" - svi ispravno
    prikazani nakon fixa.

35. ⚠️ **Prvi EAS cloud preview build (Android) se rušio odmah pri pokretanju
    na fizičkom uređaju** - development build (`expo run:android`) je
    ranije radio ispravno, ovo je bio prvi standalone/preview build napravljen
    kroz EAS. **Uzrok:** `apps/mobile/.env` (gitignored, isti obrazac kao
    `apps/web/.env` - vidi bug #6) sadrži `EXPO_PUBLIC_SUPABASE_URL`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`. EAS Build
    klonira projekt na čistu cloud VM iz gita - gitignored `.env` tamo
    jednostavno ne postoji, pa su sve tri varijable bile `undefined` u
    buildu. `src/lib/supabase.ts` zove `createClient(process.env.
    EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    ...)` na top-level importu - Supabase JS klijent baca `supabaseUrl is
    required` sinkrono već pri učitavanju modula, prije ijednog ekrana,
    što se na uređaju vidi kao trenutni crash pri pokretanju. `expo
    run:android` (lokalni build) ovo nije pogodilo jer lokalni `.env`
    postoji na disku. **Fix:** `env` blok dodan u sva tri `eas.json` build
    profila (`development`, `preview`, `production` - ne samo preview, isti
    bug bi se ponovio na prvom produkcijskom buildu da nije popravljeno
    posvuda) sa sve tri `EXPO_PUBLIC_*` vrijednosti eksplicitno upisane.
    Sigurno za commitati u git (eas.json nije gitignored) jer je
    `EXPO_PUBLIC_` prefiks po Expo konvenciji namjerno "javno, ide u
    klijentski bundle" - anon key je zaštićen Supabase RLS politikama, API
    base URL je javni Vercel domain, oba već postoje u plain textu unutar
    kompajliranog appa. Alternativa (EAS Environment Variables preko
    dashboarda/`eas env:create`) razmatrana ali odbačena kao dodatna
    pokretna komponenta bez stvarne koristi za varijable koje ionako nisu
    tajne. **Potvrđen fix:** novi build (`eas build --platform android
    --profile preview`) log eksplicitno ispisuje "Environment variables
    loaded from the 'preview' build profile 'env' configuration:
    EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_API_BASE_URL" - ranije (bez ovog fixa) ta linija nije
    postojala/bila prazna. Live test instalacije na uređaju NIJE proveden
    ovom sesijom (build link poslan korisniku, instalacija/otvaranje na
    telefonu ostaje potvrditi).

36. ⚠️ **4 fiksna kuta slikanja vozila (`.angle-grid` u signing i
    photo-request wizardu) prikazivala su se kao 2x2 grid na mobilnim
    širinama** - korisnikov bug report s pravog uređaja. **Uzrok:**
    `.angle-grid` u `apps/web/src/app/globals.css` je imao
    `grid-template-columns: 1fr 1fr` bez ikakvog responsive breakpointa -
    ta CSS klasa se dijeli između `/sign/[token]` i `/request-photos/[token]`
    (obje su javne stranice, tipično otvorene na telefonu klikom na mail
    link), pa je 2-kolonski layout na uskom ekranu prikazivao slike
    prekomalo. **Fix:** `@media (max-width: 640px) { .angle-grid {
    grid-template-columns: 1fr; } }` - jedna kolona (slike jedna ispod
    druge) ispod 640px, nepromijenjeno iznad. Pokriva oba wizarda odjednom
    jer klasa dolazi iz zajedničkog `globals.css`, ne treba dirati JSX ni
    u jednoj od dvije stranice. Potvrđeno `getComputedStyle` provjerom u
    Browser Paneu (ne punim wizard-flow testom - to bi zahtijevalo stvarne
    slikovne fajlove za upload): 375px viewport → `gridTemplateColumns`
    jedna vrijednost (jedna kolona), 1280px → dvije vrijednosti
    (nepromijenjeno ponašanje na desktopu).

    **Dodatak 2026-08-20 - korisnik prijavio da fix "ne radi" na stvarnom
    Android telefonu, unatoč gornjoj potvrdi.** Provjera je bila neispravna
    ne zato što je CSS pravilo krivo nego zato što desktop `getComputedStyle`
    provjera nikad nije bila dokaz da je taj CSS uopće UŽIVO - potvrdila je
    samo da je pravilo ispravno NAPISANO u lokalnom radnom stablu. Direktan
    fetch stvarnog production CSS bundlea
    (`https://fleet-manager-web-ten.vercel.app/_next/static/css/*.css`)
    pokazao je `grid-template-columns:1fr 1fr` BEZ ikakvog `640px` u
    datoteci - jer **ništa iz cijele sesije (uklj. ovaj fix) nije bilo
    commitano/pushano od 16.08.** (`git log` je pokazao zadnji commit
    prije početka ove sesije). Fix je uvijek bio ispravan, samo nikad nije
    deployan. Riješeno commitom + pushom (vidi arhitektonsku odluku
    "Deploy provjera prije prijave fixa" niže) - novi Vercel deploy
    pokrenut, CSS bi trebao biti uživo nakon njega. **Pouka: za bug koji
    korisnik prijavljuje sa stvarnog uređaja, prva provjera treba biti "je
    li ovo uopće deployano", ne pretpostaviti da lokalni fix = live fix.**

37. ⚠️ **Signing submit padao s "Greška prilikom slanja" i s drugim (ne
    owner) email-om - Vercelov ~4.5MB tvrdi limit za tijelo Serverless
    Function zahtjeva, ne shared-email ograničenje kako je prijašnja
    dijagnoza (vidi ograničenje #9, dodatak) pogrešno pretpostavila.**
    Korisnik je eksplicitno tražio da se ne zaključuje "vjerojatno" nego
    da se potvrdi direktnim mjerenjem prije prijave fixa - potvrđeno u dva
    koraka, oba izravno protiv produkcije (ne lokalnog dev servera, koji
    nema taj limit):
    1. `vercel logs` za zadnjih 24h nije pokazao NI JEDAN `POST
       /api/sign/[token]` unatoč jasnim dokazima (GET pozivi, kreiranje
       ugovora) da je korisnik prošao cijeli wizard - znak da Vercel
       odbija zahtjev na platform razini PRIJE nego Lambda uopće starta
       (takvi odbijeni zahtjevi se ne pojavljuju kao function-invocation
       log).
    2. Direktan `curl` POST ~5.6MB multipart tijela (8 fajlova ~700KB,
       realistična veličina za dokumente + 4 obavezna kuta + 2 oštećenja
       NAKON postojeće client-side kompresije) na pravi
       `https://fleet-manager-web-ten.vercel.app/api/sign/[token]` vratio
       je `413 Request Entity Too Large` / `FUNCTION_PAYLOAD_TOO_LARGE` -
       stvaran, izmjeren odgovor, ne pretpostavka. Kontrolni test s ~2.1MB
       tijelom (isti lažni token) je prošao platform sloj i vratio pravu
       app-level JSON grešku, potvrđujući gdje je točno granica.
       `compressImageFile` (1920px/0.82 JPEG) je provjeren i JEST
       primijenjen na svaki fajl u ovom flowu (dokumenti, 4 kuta,
       oštećenja) - problem nije "kompresija nedostaje negdje", nego da
       zbroj više komprimiranih fajlova odjednom i dalje realno probija
       platformski limit koji nema Next.js/aplikacijsku zaobilaznicu za
       Node.js Serverless Function tijelo.

    **Fix: signing wizard prebačen na direct-to-storage upload.** Umjesto
    da se svi fajlovi šalju kao multipart kroz jedan Vercel function poziv,
    klijent sad za svaki fajl (dokumenti, 4 obavezna kuta, svaka prijava
    oštećenja) prvo traži presigned PUT URL
    (`POST /api/sign/[token]/upload-url`, novi endpoint, token se provjerava
    identično `resolveSigningContract`-u da netko s isteklim/iskorištenim
    tokenom ne može izdavati upload URL-ove), zatim uploada bytes IZRAVNO
    u Hetzner preko tog URL-a (`uploadToStorage()` u
    `sign/[token]/page.tsx`) - upload se pokreće čim korisnik odabere fajl
    (nakon kompresije), ne čeka finalni submit. Finalni
    `POST /api/sign/[token]` sad šalje malen JSON (ključevi već uploadanih
    fajlova + telefon/adresa/uvjeti/potpis kao base64 - potpis je
    dovoljno malen da ostane inline), ne više multipart s binarnim
    sadržajem - platformski limit više nije relevantan jer to tijelo
    nikad ne sadrži slike. `completeSigning()` (server) više ne uploada
    dokumente/slike sam (klijent je to već napravio) - samo uploada potpis
    (mali PNG, nema smisla komplicirati) i sprema već dobivene ključeve u
    bazu. Novi `packages/api/src/schemas/signing.ts`
    (`signUploadRequestSchema`, `completeSigningRequestSchema`) - prati
    postojeću konvenciju "sve server-side validacije kroz Zod u
    packages/api" (CLAUDE.md). `getPresignedUploadUrl()` dodan u
    `storage/hetzner.ts` (PutObjectCommand analogan postojećem
    `getPresignedDownloadUrl`-u).

    **Verifikacija: stvarni end-to-end test protiv pravog Hetznera, ne
    samo typecheck/build.** `tsc --noEmit` čist na `packages/api` i
    `apps/web`, `next build` uspješan (nova `/api/sign/[token]/upload-url`
    ruta vidljiva u outputu). Browser-based UI test nije bio moguć (file
    input ne može se popuniti programatski kroz dostupne Browser Pane
    alate), pa je umjesto toga napravljen scratch Node skripta koja radi
    IDENTIČAN redoslijed poziva kao stvarni klijent kod: traži upload URL
    za svih 7 fajlova (2 dokumenta + 4 kuta + 1 oštećenje), PUT-a stvaran
    1x1 JPEG na svaki (protiv pravog Hetzner API-ja, ne mocka), zatim
    finalni JSON submit protiv lokalnog dev servera. Rezultat: `{"ok":true}`.
    Potvrđeno upitom nad bazom da je `Contract.status` prešao u `"signed"`,
    svih 5 `HandoverPhoto` redaka je kreirano s ispravnim ključevima
    (uklj. `damagedPart`/`damageDescription` za oštećenje), `Client.
    driverLicenseKey`/`idDocumentKey` spremljeni, PDF-ovi generirani
    (`contractPdfKey`/`protocolPdfKey` popunjeni). Potvrđeno i da je
    stvarni fajl (potpis) preuzimljiv natrag preko presigned download URL-a
    (200, točan broj bajtova) - zatvara petlju da objekti stvarno postoje
    u Hetzneru, ne samo da je upload poziv vratio 200. Test ugovor/klijent
    i svih 10 uploadanih objekata u Hetzneru obrisani odmah nakon
    verifikacije.

    **⚠️ Ova verifikacija NIJE bila dovoljna - propustila je stvaran bug.**
    Node-based skripta koristi Node-ov `fetch`, koji NE provodi CORS
    (preflight OPTIONS, Origin-based blokiranje odgovora) - to je isključivo
    browser sigurnosni mehanizam. Zato je test prošao dok je pravi uređaj
    (pravi browser) pucao na PUT koraku. Vidi bug #38 za pravi uzrok i fix.
    **Pouka: server-to-server simulacija (curl/Node fetch) NIKAD nije
    dovoljna za potvrdu browser-facing upload flowa koji ide na
    cross-origin URL - mora se testirati kroz stvaran browser (ili barem
    Chromium-based automatizaciju koja provodi CORS), inače se cijela ova
    klasa buga sustavno promašuje.**

    **Preostaje:** `/request-photos/[token]` dijeli isti
    `compressImageFile` + multipart-submit obrazac za 4 obavezna kuta
    (bez dokumenata/potpisa, pa manji tipičan payload, ali ista klasa
    rizika ako se doda više slika) - nije popravljen ovom sesijom.
    **✅ Popravljeno u bugu #39 (sljedeća sesija) - isti direct-to-storage
    obrazac primijenjen i tamo.**

38. ⚠️ **Nastavak bug #37 - presigned upload je i dalje pucao na PRAVOM
    uređaju čak i nakon deploya, s specifičnom porukom "Upload nije
    uspio" (iz PUT koraka, ne finalnog submita).** Korisnik je ispravno
    posumnjao da je uzrok CORS, i eksplicitno tražio pravi HTTP status/
    error prije bilo kakvog fixa (isto pravilo kao bug #36-dodatak - ne
    zaključivati iz posrednih znakova). **Reprodukcija napravljena kroz
    Claude Browser Pane** (stvaran Chromium, provodi CORS za razliku od
    curl/Node fetch - vidi pouku u bugu #37 gore) - otvorena stvarna
    `/sign/[token]` stranica na produkcijskom originu
    (`fleet-manager-web-ten.vercel.app`), pa izvršen `fetch()` UNUTAR
    stranice (isti kod-put kao `uploadToStorage()`, samo ručno pozvan
    preko `javascript_tool`-a radi izolacije koraka). Rezultat: `TypeError:
    Failed to fetch` na PUT-u, a konzola je otkrila pravi uzrok:
    ```
    Access to fetch at 'https://fsn1.your-objectstorage.com/...' from
    origin 'https://fleet-manager-web-ten.vercel.app' has been blocked by
    CORS policy: Response to preflight request doesn't pass access
    control check: No 'Access-Control-Allow-Origin' header is present on
    the requested resource.
    ```
    Direktna provjera (`GetBucketCorsCommand`) potvrdila je da Hetzner
    bucket **nije imao NIKAKVU CORS konfiguraciju** (`NoSuchCORSConfiguration`)
    - očekivano, jer dosad ništa u appu nije radilo cross-origin PUT/GET
    preko fetcha (downloadi idu kroz `<a href>`/`<img src>`, koji ne
    provode CORS).

    **Fix, u dva koraka (prvi pokušaj nije bio dovoljan - i to potvrđeno
    mjerenjem, ne pretpostavkom):**
    1. Prvi pokušaj: uska CORS politika (`AllowedMethods: [PUT]`,
       `AllowedHeaders: [content-type]`). Rezultat provjeren `curl -i -X
       OPTIONS` s `Origin`/`Access-Control-Request-*` headerima - preflight
       JE ispravno odgovarao s `access-control-allow-origin`. Ali stvaran
       `curl -i -X PUT` (s `Origin` headerom, simulira što browser šalje
       nakon uspješnog preflighta) na isti presigned URL vratio je `200 OK`
       (upload je stvarno uspio server-side) ali BEZ
       `access-control-allow-origin` u odgovoru - po CORS spec-u, browser
       mora odbaciti i takav odgovor iako je HTTP status uredan, jer
       nedostaje header na SAMOM zahtjevu (ne samo na preflightu). Ponovljen
       real-browser test - i dalje `Failed to fetch`, potvrdio da uska
       politika nije dovoljna.
    2. Širi pravilo riješio problem: `AllowedMethods: [GET, PUT, POST,
       HEAD]`, `AllowedHeaders: ["*"]`, dodan `ExposeHeaders: [ETag]`.
       Točan razlog zašto uža verzija nije radila na Hetznerovom Ceph RGW
       backendu (vidljivo iz `x-debug-bucket`/`ceph5` u response headerima)
       nije dublje istražen - poznata je kategorija Ceph RGW CORS
       implementacijskih nedosljednosti između preflight i stvarnog
       odgovora, ali točan mehanizam ovdje nije potvrđen, samo da šire
       pravilo radi. Ponovljen identičan real-browser test (Browser Pane,
       stvaran production origin) - `PUT status: 200, PUT ok: true`, bez
       ijedne CORS greške u konzoli. Zatim ponovljen i za `photo`/`front`
       purpose (drugi kod-put istog `uploadToStorage()`-a) - identičan
       uspjeh.

    **Ovo je infrastrukturna promjena, NE dio gitanog koda** - CORS
    politika živi na samom Hetzner bucketu, nije u repou. Perzistirano kao
    `packages/api/scripts/configure-hetzner-cors.mjs` (idempotentan,
    siguran za re-run) da se ne izgubi i da postoji jasan trag što točno
    treba ponovno pokrenuti ako se bucket ikad rekreira ili doda novi
    produkcijski domain (npr. custom domain umjesto `*.vercel.app` aliasa -
    tad MORA se dodati u `allowedOrigins` popis u scripti i ponovno
    pokrenuti). Primijenjeno izravno na produkcijski bucket (isti bucket
    koji dev i produkcija dijele, kao i baza).

    Test podaci (scratch ugovor/klijent kreiran za ovaj real-browser test,
    svi uploadani probni objekti) obrisani nakon verifikacije - vidi
    `ListObjectsV2`/`DeleteObjects` po prefiksu umjesto ručnog nabrajanja
    ključeva, čišće za višestruke probne uploade tijekom debugiranja.

39. ✅ **Isti direct-to-storage + CORS fix (bugovi #37/#38) primijenjen na
    `/request-photos/[token]`**, na korisnikov eksplicitan zahtjev (ista
    klasa rizika - Vercel body limit + presigned PUT CORS - identificirana,
    a još nije udarila kao stvaran incident tamo). Infrastrukturna strana
    (CORS na Hetzner bucketu) nije trebala dodatan rad - `bug #38`-ov fix
    već pokriva sve app origine, uklj. `localhost:3000` korišten za ovaj
    test.

    **App-side refactor, identičan sign-flow obrascu:**
    - `packages/api/src/schemas/photoRequest.ts`: novi
      `photoRequestUploadRequestSchema` (traži upload URL po slici) i
      `completePhotoRequestRequestSchema` (finalni JSON submit - ključevi
      umjesto binarnog sadržaja).
    - `packages/api/src/server/photoRequests.ts`: nova
      `createPhotoRequestUploadUrl()` (isti token-check obrazac kao
      `resolvePhotoRequest`), `completePhotoRequest()` više ne uploada
      ništa sam (nema više ni signature-a za uploadati kao kod signing
      flowa - ovaj flow nema potpis - pa je server strana sad ČISTO
      spremanje već dobivenih ključeva u bazu, bez ijednog S3 poziva).
    - Novi `apps/web/src/app/api/photo-requests/[token]/upload-url/route.ts`.
    - `apps/web/src/app/api/photo-requests/[token]/route.ts`: POST prebačen
      s `request.formData()` na `request.json()` + zod validacija.
    - `apps/web/src/app/request-photos/[token]/page.tsx`: dodan
      `compressImageFile` (usput otkriveno da ovaj flow NIKAD nije
      kompresirao slike, za razliku od signing wizarda - sad ujednačeno),
      per-slot `key`/`uploading`/`uploadError` state (identičan
      `AngleSlot` obrazac kao `sign/[token]/page.tsx`), `uploadToStorage()`
      helper repliciran lokalno (isti kod kao u sign pageu, namjerno NE
      izvučen u dijeljeni modul - ovaj projekt već drži svaki
      signing/photo-request wizard kao samostalnu stranicu, vidi
      duplicirane `ANGLE_LABELS`/`REQUIRED_ANGLES` konstante koje su
      postojale i prije ovog fixa).

    **Verifikacija: STVARAN browser, ne Node/curl - naučena lekcija iz
    bug #38 primijenjena od početka ovaj put, ne tek nakon što je test
    pao na uređaju.** Claude Browser Pane (pravi Chromium) otvorio pravu
    `/request-photos/[token]` stranicu na lokalnom dev serveru
    (`localhost:3000`, u CORS allowlisti), izvršio identičan
    `uploadToStorage()`-ekvivalent kod preko `javascript_tool`-a za sve
    4 obavezna kuta - svaki `upload-url` poziv 200, svaki PUT na Hetzner
    200 `ok=true`, konzola bez ijedne CORS/network greške. Finalni JSON
    submit kroz isti real-browser kontekst - `{"ok":true}`. Potvrđeno
    upitom nad bazom: `PhotoRequest.fulfilledAt` postavljen,
    `requestToken` invalidiran (null), svih 4 `HandoverPhoto` retka
    kreirano s ispravnim ključevima i opisom oštećenja. Test
    `PhotoRequest` i svi uploadani objekti obrisani nakon verifikacije.

    `tsc --noEmit` čist na `packages/api` i `apps/web`, `next build`
    uspješan (nova `/api/photo-requests/[token]/upload-url` ruta vidljiva
    u outputu). **Isključivo web promjena** (`apps/web`, `packages/api`) -
    `apps/mobile` nije dirano, nije potreban novi EAS build.

40. ⚠️ **Owner web login (`/login`) padao nakon klika na magic link -
    korisnik vraćen na `/login` s praznom formom, BEZ ikakve vidljive
    greške.** Korisnik eksplicitno tražio dokaz prije fixa (Vercel Function
    Logs, deploy-regresija provjera, Supabase redirect allowlist, stvarno
    cookie ponašanje) - sva četiri provjerena izravno, ne pretpostavkom:

    1. **Vercel Function Logs** (`vercel logs`, CLI je već bio ulogiran
       preko postojećeg `xdg.data/com.vercel.cli/auth.json` - nije trebalo
       novi login) potvrdili su da je `/api/auth/callback` STVARNO pozvan
       (dvaput, 2026-08-21 11:54:50 i 11:55:50), oba puta odmah praćena s
       `GET /login` - ruta se izvršava i redirecta natrag, nije da se
       uopće ne pokreće. Log je otkrio ključan detalj: `POST
       /api/auth/owner/request-link` (11:54:33) izvršen je na hostu
       `fleet-manager-web-ten.vercel.app`, dok su OBA `/api/auth/callback`
       poziva izvršena na DRUGOM hostu,
       `fleet-manager-web-branimir-s-projects1.vercel.app` - dvije različite
       domene za isti login pokušaj.
    2. **Deploy-regresija provjerena** (`vercel ls fleet-manager-web`) -
       nije regresija od deploy-a, oba aliasa (`-ten` i
       `-branimir-s-projects1`) postoje i pokazuju na isti, aktualan
       deployment već 5+ dana (od otprilike 16.08., vidi bug #38 kontekst
       gdje je `-ten` prvi put korišten za browser-based CORS test) -
       problem je latentan otkad postoje DVIJE žive produkcijske domene, ne
       nešto uvedeno ovom ili prijašnjom sesijom.
    3. **Supabase Authentication → URL Configuration allowlist provjerena
       IZRAVNIM pozivom** (scratch skripta, `supabase.auth.signInWithOtp`
       s eksplicitnim `emailRedirectTo` za tri različite domene, uklj. NIKAD
       prije viđenu nasumičnu `*.vercel.app` domenu) - **SVE tri su
       prihvaćene** (`OK`, ne "invalid redirect URL"), što dokazuje da je
       Supabase strana konfigurirana s permisivnim `*.vercel.app` wildcard
       pravilom, NE uskom listom - allowlist nikad nije bio uzrok i nije
       trebao nikakvu izmjenu. (Usput zabilježeno kao manji, odvojen nalaz:
       taj wildcard je širi nego što treba - dozvoljava emailRedirectTo na
       BILO KOJU `*.vercel.app` domenu, ne samo projektu vlastite aliase -
       nije popravljeno ovom sesijom, nije uzrok ovog buga.)
    4. **Cookie ponašanje potvrđeno izravno kroz Browser Pane, ne
       pretpostavkom** - pravi submit owner login forme na
       `fleet-manager-web-ten.vercel.app` (stvaran magic-link mail poslan
       na `b.malenica34@gmail.com`) pokazao je `document.cookie` odmah
       nakon submita: **`sb-...-auth-token-code-verifier` i srodni PKCE
       cookiji SU postavljeni, ali kao Host-only** (nema `Domain` atributa,
       očekivano - `@supabase/ssr` default). Navigacija na
       `fleet-manager-web-branimir-s-projects1.vercel.app` odmah zatim
       pokazala je `document.cookie` **prazan string** - cookie stvarno NIJE
       vidljiv na drugoj domeni, potvrđeno mjerenjem, ne teorijom.

    **Pravi uzrok:** `apps/web/src/app/api/auth/{owner,client}/
    request-link/route.ts` su fallback `emailRedirectTo` (kad web poziv ne
    šalje mobile `redirectTo`) gradili od **fiksne env varijable**
    (`` `${process.env.NEXT_PUBLIC_OWNER_APP_URL}/api/auth/callback` ``) -
    JEDNA, uvijek ista domena, bez obzira s koje je od dvije važeće
    produkcijske domene korisnik zapravo poslao zahtjev. PKCE
    `code_verifier` cookie je Host-only (vezan na domenu koja ga je
    postavila), pa čim korisnik zatraži link s BILO KOJE domene različite
    od `NEXT_PUBLIC_OWNER_APP_URL` vrijednosti, magic link ga uvijek vodi
    na `/api/auth/callback` na TU fiksnu domenu, gdje `exchangeCodeForSession`
    tiho puca (cookie nedostupan) → `/api/auth/callback/route.ts` (već
    postojeći kod) redirecta na `/login?error=invalid_link` → **`/login`
    stranica nikad nije čitala `error` query param**, pa korisnik vidi samo
    praznu formu, bez ikakvog traga da je bilo što pokušano.

    **Fix, dva dijela:**
    1. `owner/request-link` i `client/request-link` rute: fallback sad
       gradi `emailRedirectTo` od **stvarnog origina zahtjeva**
       (`new URL(request.url).origin`), ne fiksne env varijable - isti
       obrazac koji `/api/auth/callback/route.ts` već koristi za svoje
       redirecte (`url.origin`). Sigurno bez dodatne allowlist provjere jer
       Vercel routing sam po sebi ograničava koje domene uopće mogu
       stvarno posluživati taj request (ne postoji način da klijent
       "izmisli" origin izvan stvarno dodijeljenih aliasa/domena
       deploymenta). `NEXT_PUBLIC_OWNER_APP_URL` ostaje netaknuta env
       varijabla - i dalje default za lokalni dev (`localhost:3000`) i za
       mobile (`resolveEmailRedirectTo` i dalje prvo provjerava
       `MOBILE_APP_SCHEME`, taj dio flowa nepromijenjen).
    2. `/login` i `/portal/login`: dodan `useEffect` koji čita
       `window.location.search` na mount i prikazuje jasnu poruku ako je
       `?error=invalid_link` prisutan ("Link za prijavu je istekao ili je
       već iskorišten. Zatraži novi.") - obrana u dubinu, pokriva i
       legitimne slučajeve (istekao/dvaput kliknut link) koji nisu ovaj
       specifični uzrok, ali su prije bili jednako nevidljivi. Namjerno
       `window.location.search` umjesto `useSearchParams()` - potonji bi
       zahtijevao Suspense boundary da `/login`/`/portal/login` ostanu
       statički prerenderani (`○` u build outputu), a client-only efekt na
       mount je dovoljan za ovaj slučaj.

    **Verifikacija:** `tsc --noEmit` čist, `next build` čist (`/login` i
    `/portal/login` ostali `○ Static`). **Nije verificirano stvarnim
    magic-link klikom nakon deploya** (isti razlog kao ranije PKCE
    ograničenje - klik mora biti u browseru koji je zahtjev poslao, Claude
    Browser Pane ne može čitati pravi email inbox) - preporučen stvaran
    test od korisnika nakon deploya: zatraži link s `-ten` domene, klikni
    ga, potvrdi da landa na `/vehicles`.

    **Dodatak - drugi sloj istog buga, korisnik prijavio da fix "još ne
    radi" na SVJEŽEM zahtjevu.** Simptom se promijenio - link u mailu je
    sad vodio na `http://localhost:3000` (`otp_expired`/connection refused,
    ne `invalid_link`), što je korisnik ispravno prepoznao kao drugačiji
    uzrok od prvog sloja: Supabase "Site URL" postavka (Authentication →
    URL Configuration), izvan koda/gita. Potvrđeno izravnim mjerenjem
    (`supabase.auth.admin.generateLink()`, `SUPABASE_SERVICE_ROLE_KEY`,
    isti obrazac kao "Dopuna 2026-08-19" niže) - poziv s eksplicitnim
    `redirectTo` za `-ten` domenu vratio je stvaran `action_link` s
    `redirect_to=http://localhost:3000` u query stringu. Ovo otkriva
    GoTrue ponašanje koje NIJE bilo poznato u prvom krugu dijagnoze: kad
    `redirectTo` nije na Redirect URLs allowlisti, GoTrue ga **tiho
    zamijeni sa Site URL** umjesto da vrati grešku pozivatelju.

    **Ovo obezvrjeđuje raniji zaključak "Supabase allowlista ima
    permisivan `*.vercel.app` wildcard"** iz glavnog dijela buga #40 gore -
    taj zaključak je bio pogrešan, izveden iz `signInWithOtp`-ovog `error`
    polja (koje ostaje `null` čak i kad je redirectTo tiho odbačen i
    zamijenjen - "OK" odgovor NE znači da je traženi redirectTo stvarno
    prihvaćen). Ispravna metoda provjere je `generateLink` + čitanje
    stvarnog `action_link`/`redirect_to` iz odgovora, ne oslanjanje na
    `error` polje drugih auth poziva.

    **Fix (ručna izmjena u Supabase dashboardu, korisnik proveo):** Site
    URL promijenjen s `http://localhost:3000` na
    `https://fleet-manager-web-branimir-s-projects1.vercel.app`, i
    `https://fleet-manager-web-ten.vercel.app/**` dodan u Redirect URLs
    allowlistu (postojeći retci, uklj. `rentacarmanager://**` za mobile,
    netaknuti). Ponovljen `generateLink` test nakon promjene za sve tri
    ciljne domene (`-ten`, `-branimir-s-projects1`, mobile scheme) -
    **sve tri sad vraćaju ispravan `redirect_to`, potvrđeno prije nego je
    korisnik zatražen da išta klikne** (točno kako je korisnik i tražio -
    provjeri prije traženja klika). **Stvaran magic-link klik nakon ovog
    fixa nije potvrđen u chatu** - korisnik je prešao na sljedeći zadatak
    prije potvrde, treba zatražiti taj test kad se razgovor vrati na temu.

41. **VIN ekstrakcija (OCR, unutarnja strana prometne) hvatala tekst
    legende umjesto stvarnog VIN-a kad dokument ima legendu koja objašnjava
    EU šifre PRIJE retka sa stvarnim vrijednostima** (npr. "E -
    Identifikacijski broj vozila" ranije u tekstu nego stvarni redak s
    VIN-om). Otkriveno i popravljeno u istoj sesiji kao razdvajanje OCR-a
    na vanjsku/unutarnju stranu (vidi arhitektonsku odluku niže), na
    korisnikov eksplicitan zahtjev ("ne hvataj tekst iz legende koda").
    Pravi uzrok: `matchByCode(rawText, "E") ?? matchVin(rawText)` - kad je
    "E" šifra pronađena VIŠE puta (jednom u legendi, jednom uz stvarnu
    vrijednost), `matchByCode` je uvijek vraćao PRVI pogodak bez ikakve
    validacije da li stvarno izgleda kao VIN, pa je `?? matchVin(...)`
    fallback bio kratko-spojen (nikad se nije ni izvršio jer je prvi dio
    već vratio istinit, samo pogrešan, rezultat). Fix: novi
    `findCodeValueWindows(text, code)` helper prolazi kroz SVAKU pojavu
    šifre (ne samo prvu), i `matchVin` sad validira svaki kandidat protiv
    strogog VIN regexa (`/\b[A-HJ-NPR-Z0-9]{17}\b/`, 17 znakova bez I/O/Q)
    prije prihvaćanja - legenda ne prolazi validaciju pa se petlja
    nastavlja na sljedeću pojavu koda. Isti obrazac primijenjen i na
    tablice (`matchLicensePlate`, koristi se samo na vanjskoj strani).
    Regresija-testirano sintetičkim primjerom koji točno reproducira
    legenda-prije-vrijednosti redoslijed - stari kod bi vratio tekst
    legende, novi kod ispravno vraća stvarni VIN sa sljedeće pojave šifre.
    Vidi Tier 2 dnevnik na vrhu dokumenta za pun opis promjene.

42. ⚠️ **`pdf-parse`/`pdfjs-dist` (nova ovisnost za OCR police osiguranja)
    puca s `TypeError: Object.defineProperty called on non-object` kad se
    pozove kroz stvaran Next.js API route - isti razred buga kao bug #11
    (`@react-pdf/renderer`), ali `experimental.serverComponentsExternalPackages`
    recept koji je riješio bug #11 OVDJE NIJE upalio prvi put.** Otkriveno
    tako što je `next build` prošao čisto (kao i kod bug #11), ali stvaran
    poziv kroz `curl` na dev server vratio `500` - potvrđuje pravilo iz
    bug #11: build success ≠ runtime correctness za Node-only pakete kroz
    RSC bundling sloj, treba stvaran runtime poziv, ne samo build.

    **Dijagnoza, korak po korak, sve potvrđeno inspekcijom stvarnog
    outputa/grešaka, ne pretpostavkom:**
    1. `next build` čist, ali `curl -X POST .../api/ocr/insurance-policy`
       (bez auth-a, samo da se provjeri da li se modul uopće učita) vratio
       `500`. `preview_logs` otkrio stack trace: greška u
       `webpack-internal:///(rsc)/.../pdfjs-dist/legacy/build/pdf.mjs`,
       pozvana iz `pdf-parse`, pozvano iz `packages/api/src/ocr/pdfText.ts`.
    2. Dodan `pdf-parse`/`pdfjs-dist` u `serverComponentsExternalPackages`
       (identičan recept kao bug #11) - **identična greška, bez promjene.**
       Inspekcija `.next/server/vendor-chunks/pdfjs-dist.js` pokazala
       PUNI bundlani izvorni kod (2.5MB), ne tanki `require()` wrapper -
       eksternalizacija se STVARNO nije dogodila, unatoč config unosu.
       Usporedba s `@react-pdf/renderer`-ovim vendor chunkom (koji ISTO
       postoji kao datoteka, ali svejedno radi) pokazala da samoća
       postojanja vendor-chunk datoteke ne dokazuje da eksternalizacija
       nije uspjela - trebalo je dublje kopanje.
    3. Pokušan `webpackIgnore: true` magic comment na dinamičkom
       `import("pdf-parse")` (forsira Node-ov nativni ESM loader mimo
       webpacka) - **napredak, ali druga greška:** `ERR_MODULE_NOT_FOUND`,
       Node ne može resolvati "pdf-parse" iz `apps/web/.next/server/...`
       lokacije. Pravi uzrok otkriven: pod pnpm strict izolacijom,
       `pdf-parse` je instaliran SAMO u `packages/api/node_modules`
       (tranzitivna ovisnost za `apps/web`), pa Node-ov runtime resolver
       (koji, za razliku od webpacka, ne prati monorepo workspace graf)
       ne može ga naći kad izvršava kod iz `apps/web`-ovog compiled
       outputa.
    4. **Pravi fix:** `pdf-parse` dodan kao DIREKTNA ovisnost i
       `apps/web`-u (`pnpm --filter web add pdf-parse
       --virtual-store-dir=C:/v`, isti CLI flag workaround kao bug #18),
       `webpackIgnore` hack uklonjen (vraćen normalan static import),
       `serverComponentsExternalPackages` unos zadržan. Ovo je vjerojatno
       i pravi razlog zašto ni originalni `serverComponentsExternalPackages`
       pokušaj (korak 2) nije radio - Next-ov tracer za taj mehanizam
       vjerojatno također ovisi o tome da je paket resolvable iz samog
       `apps/web`-a, ne samo tranzitivno.

    **Verifikacija: stvaran runtime poziv kroz Next dev server, ne samo
    build.** Privremena debug ruta bez auth-a (`/api/ocr/_debugtest`,
    preimenovana iz `_debug-insurance-test` jer Next tretira `_`-prefiksane
    foldere kao private route segmente - 404 umjesto izvršavanja rute, prvi
    pokušaj testiranja), uklonjena nakon testiranja. 3 sintetička PDF-a
    generirana kroz `@react-pdf/renderer` (stvaran PDF, ne mock), poslana
    kroz `curl -F` na stvarnu rutu: sva tri vratila `200` s ispravno
    izvučenim datumom (vidi Tier 2 dnevnik na vrhu za detalje o
    ekstrakcijskoj logici i drugom bugu otkrivenom usput - window-sizing).
    **Ova verifikacija je bila NEDOVOLJNA - propustila je bug #43 ispod,
    jer je rađena samo protiv `next dev`, ne protiv stvarnog produkcijskog
    builda/Vercel runtimea.**

43. ⚠️⚠️ **P0 regresija iz buga #42 - `pdf-parse` je slomio OWNER I CLIENT
    LOGIN u produkciji (ne samo OCR rutu, ne samo mobile).** Korisnik
    prijavio `request_failed_500` na mobile magic-link zahtjevu nakon
    novog EAS builda, ispravno posumnjao da je vezano za OCR promjenu iz
    buga #42 i eksplicitno tražio pravi log prije bilo kakvog fixa.

    **Dijagnoza, sve potvrđeno stvarnim dokazom:**
    1. `vercel logs` na `POST /api/auth/owner/request-link` (ruta koju
       mobile poziva za magic link) otkrio `ReferenceError: DOMMatrix is
       not defined` iz `pdfjs-dist/legacy/build/pdf.mjs` - na ruti koja
       NIKAD ne poziva OCR. Ovo odmah isključuje korisnikovu treću
       hipotezu (Site URL/redirectTo validacija) - crash se događa PRIJE
       ijednog Supabase poziva, na razini modul-importa same rute.
    2. **Kritičan nalaz: budući da web i mobile owner login idu kroz ISTU
       rutu, web login je bio JEDNAKO slomljen kao mobile** - ovo nije
       bio mobile-specifičan problem, nego globalna produkcijska
       regresija za sve owner/client prijave, uzrokovana prošlom sesijom.
    3. Pravi uzrok: `packages/api/src/server/index.ts` je `export *`
       barrel. Statički top-level `import { PDFParse } from "pdf-parse"`
       u `pdfText.ts` (bug #42) znači da SVAKA ruta koja uvozi bilo što iz
       tog barrela (npr. `isEmailAllowedAsOwner` u `owner/request-link`)
       povlači pdf-parse/pdfjs-dist u svoj modul-graf i izvršava njegov
       top-level kod (uklj. neuspio DOMMatrix polyfill pokušaj) ČAK I KAD
       ta ruta nikad ne poziva OCR funkciju.
    4. Pokušaj reprodukcije lokalno kroz PRAVI produkcijski build
       (`next build` + `next start`, ne `next dev` koji je korišten za
       bug #42-ovu "verifikaciju") na istoj ruti - **NIJE reproducirao
       crash** (čist `403 not_authorized`). Ovo dokazuje da lokalni
       Windows produkcijski build i Vercelov Linux serverless runtime
       imaju stvarno različito ponašanje za ovaj specifičan slučaj -
       razlog nije dublje istražen (vjerojatno platform-specifično
       ponašanje u pdfjs-dist-ovom `require("@napi-rs/canvas")`
       try/catch fallbacku), ali je bitna metodološka pouka: **`next
       build` uspjeh, čak ni lokalni `next start`, ne garantira da će se
       runtime ponašanje poklapati s Vercelovim produkcijskim
       okruženjem za Node-only pakete sa platform-specifičnim kodom.**

    **Fix:** `pdfText.ts`-ov `pdf-parse` uvoz promijenjen s top-level
    statičkog na dinamički (`await import("pdf-parse")` unutar
    `extractPdfText` funkcije) - modul se sad evaluira TEK kad se OCR
    police stvarno pozove, ne kad bilo koja ruta uveze bilo što iz
    barrela. `grep` potvrdio da nema drugih statičkih `pdf-parse` uvoza
    igdje u kodu.

    **Verifikacija: izravno protiv PRAVE produkcije nakon deploya, ne
    lokalno.** Nakon što je fix pushan (uz eksplicitnu korisnikovu potvrdu
    zbog P0 hitnosti) i deploy potvrđen gotovim (`vercel ls`), `curl` na
    TOČNO istu rutu koja je prije pucala vratio čist `403 not_authorized`
    (očekivano za testni neovlašten email, ne 500), `vercel logs` potvrdio
    `info` razinu za taj zahtjev (ne `error`). Sve tri OCR rute također
    provjerene izravno protiv produkcije (401 unauthorized, bez crasha -
    modul se sad učitava čisto svugdje).

    **Preostaje neriješeno, niži prioritet od login fixa:** DOMMatrix
    problem je samo IZOLIRAN (više ne curi u nepovezane rute), NIJE
    stvarno riješen za slučaj kad se insurance-policy OCR stvarno pozove
    (autentificirano, sa stvarnim PDF-om) - to je točno kad se dinamički
    `import("pdf-parse")` izvrši, pa bi isti DOMMatrix crash mogao i dalje
    pogoditi SAMU OCR funkcionalnost u produkciji (samo više ne curi na
    login). Nije testirano zbog auth ograničenja (isti PKCE limit kao
    uvijek). **Prava OCR-za-policu funkcionalnost treba stvaran test u
    produkciji prije nego se smatra pouzdano radnom** - ako i dalje puca,
    treba dodatni fix (npr. `@napi-rs/canvas` kao eksplicitna ovisnost,
    ili zamjena `pdf-parse`/`pdfjs-dist`-a alternativnom bibliotekom bez
    canvas-zavisnih polyfilla za čistu tekst-ekstrakciju).

44. **Ekstrakcija datuma isteka iz police osiguranja nije pogađala stvaran
    dokument (Adriatic osiguranje AO polica, korisnik priložio pravi PDF u
    chatu) - stara fiksna lista fraza nije sadržavala format ove
    osiguravajuće kuće ("Istek godišnjeg osiguranja").** Korisnik
    eksplicitno tražio generalizaciju (širi pattern-match, ne dodavanje
    još jednog keyworda) uz test protiv OBA scenarija (stari sintetički +
    novi stvaran PDF).

    **Sirovi tekst stvarnog PDF-a otkrio je dvije stvari koje sintetički
    testovi nisu pokrili:**
    1. Label i vrijednost su na ODVOJENIM recima ("Istek godišnjeg
       osiguranja:" svoj redak, "07.07.2027." tek SLJEDEĆI redak) - stara
       `findKeywordWindows` logika je stala na sljedećem prijelomu retka
       upravo da NE bi pokupila datum iz sljedeće nepovezane rečenice
       (bug #42 window-sizing fix), što je sad postalo prestrogo za ovaj
       layout.
    2. PDF tekstualni sloj duplicira SVAKI redak zaredom (vjerojatno
       artefakt kako je dokument generiran/rendered) - "Istek godišnjeg
       osiguranja:" se pojavljuje dvaput prije nego se ijedan datum
       uopće pojavi.

    **Fix:** ekstrakcija prepravljena na red-po-red pristup: bilo koji
    redak koji sadrži riječ iz skupa ("istek"/"isteka" prioritetno,
    "vrijedi do"/"važi do"/"važenja"/"trajanje"/"razdoblje" kao širi
    fallback sloj - vidi Tier 2 dnevnik na vrhu dokumenta zašto je
    prioritet nužan, ne ravan skup) + datum u ISTOM ili SLJEDEĆEM retku.
    Deduplikacija susjednih identičnih redaka prije skeniranja rješava
    duplicirani-redak artefakt (no-op za dokumente bez tog artefakta -
    sigurno za sintetičke testove). Postojeći fallback (najkasniji datum
    bilo gdje u dokumentu) zadržan kao sigurnosna mreža, nepromijenjen.

    **Prvi prolaz generalizacije je UNIO regresiju, uhvaćenu prije prijave
    gotovosti jer je korisnik eksplicitno tražio ponovni test protiv
    starog sintetičkog scenarija.** Kad je više datuma u istom retku
    ("Razdoblje osiguranja: od 15.03.2026. do 15.03.2027.", oba datuma na
    jednom retku), novi red-po-red kod je uzimao PRVI datum (početak
    razdoblja) umjesto ZADNJEG (kraj) - vraćalo bi `2026-03-15` umjesto
    ispravnog `2027-03-15`. Popravljeno da `extractDateFromLine` uzima
    zadnji valjan datum u retku, ne prvi.

    **Verifikacija - sva 4 scenarija u istom testnom prolazu, izravno
    protiv `pdf-parse`-ove stvarno izvučene ekstrakcije teksta (ne
    ručno sastavljen tekst):** stari sintetički "razdoblje osiguranja"
    (`2027-03-15`, ispravno nakon regresija-fixa), stari sintetički
    "tehnički pregled vrijedi do" (`2027-06-20`, nepromijenjeno), stari
    sintetički fallback bez keyworda (`2026-10-10`, nepromijenjeno),
    **stvaran Adriatic PDF** (`2027-07-07`, potvrđeno protiv stvarnog
    sadržaja police - "Istek godišnjeg osiguranja: 07.07.2027.").

    **Usput dodano (korisnik eksplicitno pozvao na razmišljanje, ne
    obavezan zahtjev):** tablice i VIN se sad TAKOĐER vade iz police kao
    paralelni, usporedni izvor uz postojeći OCR fotografije prometne -
    PDF tekstualni sloj police je pouzdaniji (nema rizika krivog čitanja
    znakova kao slikovni OCR). Stvaran primjer potvrđuje: `licensePlate:
    "ZG1278JI"`, `vin: "WBA51AP05PCL47053"`, oboje točno kako stoji na
    polici. Marka/model NAMJERNO nisu vađeni - polica ih navodi kao jedan
    spojen string ("BMW, SERIJA 4 430I"), nema pouzdanog načina razdvojiti
    marku od modela/trima bez lomljivog nagađanja. Postojeći OCR flow za
    prometnu (`extractRegistrationDoc.ts`) NIJE mijenjan - samo je
    refaktoriran da dijeli VIN/tablice regex obrasce s novim
    `packages/api/src/ocr/patterns.ts` umjesto lokalne duplicirane
    definicije (čist refactor, ponašanje nepromijenjeno).

    Vidi arhitektonsku odluku "Polica osiguranja: istek osiguranja kao
    proxy za istek registracije" (sekcija 3) za odgovor na korisnikovo
    pitanje je li ta pretpostavka bila namjerna - bila je, ali je prije
    bila dokumentirana samo u kod komentaru, sad formalno zapisana kao
    arhitektonska odluka s jasnim UI posljedicama.

45. ⚠️ **Neriješeni rizik zabilježen na kraju buga #43 se ostvario -
    insurance-policy OCR je stvarno pucao u produkciji** (`parse_failed`),
    korisnik uhvatio na stvarnom testu novog `/vehicles/new` mobile
    ekrana s pravim Adriatic PDF-om. `vercel logs` potvrdio identičan
    mehanizam kao bug #43, samo sad IZOLIRAN unutar same OCR rute (bug
    #43-ov fix je ispravno spriječio curenje u nepovezane rute - ruta je
    vratila čist `502 parse_failed` odgovor, ne srušila cijeli proces):
    ```
    Warning: Cannot load "@napi-rs/canvas" package: "Error: Cannot find module..."
    Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
    ReferenceError: DOMMatrix is not defined
        at pdfjs-dist/legacy/build/pdf.mjs:15620:22
    ```
    Pravi uzrok: `pdfjs-dist` pokušava polyfill-ati `DOMMatrix`/`Path2D`/
    `ImageData` preko opcionalnog `@napi-rs/canvas` paketa (nije
    instaliran - namjerno, ne treba nam pravi rendering, samo `getText()`).
    Kad taj paket nije dostupan, pdfjs-dist pada natrag na VLASTITI
    manualni polyfill pokušaj - koji je pokvaren u ovoj verziji (baca
    umjesto da tiho degradira).

    **Fix:** `pdfText.ts` sad postavlja minimalne stub-implementacije za
    `DOMMatrix`/`Path2D`/`ImageData` na `globalThis` (uvjetno,
    `typeof === "undefined"`, da ne prepiše pravu implementaciju ako je
    ikad dostupna) PRIJE dinamičkog uvoza `pdf-parse`-a - poznat community
    workaround za pdfjs-dist u Node okruženju bez canvas biblioteke kad je
    potrebna samo tekst-ekstrakcija. Ne treba stvarna matrica/canvas
    funkcionalnost za `getText()`, samo da modul-level kod pdfjs-dist-a
    prestane pucati na referenci koja ne postoji.

    **Verifikacija:** `tsc --noEmit` i `next build` čisti. Ekstrakcija
    protiv stvarnog Adriatic PDF-a lokalno i dalje vraća identičan tekst
    sa stub-ovima aktivnim (nema regresije). **NIJE moguće lokalno
    reproducirati originalni crash** (isti razlog kao bug #43 - lokalni
    Windows `next build`+`next start` nikad nije pucao, uzrok te razlike
    između Windows i Vercelovog Linux runtimea nikad nije utvrđen) - ovaj
    fix čeka stvaran test u produkciji (novi deploy + korisnikov stvaran
    test s PDF-om, isti kao što je otkrio ovaj bug) prije nego se smatra
    potvrđeno riješenim. Ako i dalje puca, sljedeći koraci: (a) probati
    `@napi-rs/canvas` kao eksplicitnu ovisnost (rizik: native binary +
    Vercel file-tracing, isti razred problema kao Prisma query engine
    binary), ili (b) zamjena `pdf-parse`/`pdfjs-dist`-a alternativnom
    bibliotekom bez canvas-zavisnih polyfilla (npr. `unpdf`).

    **Dodatak - opcija (a) se ostvarila, DOMMatrix fix nije bio dovoljan.**
    Korisnik ponovio test s istim PDF-om, `parse_failed` i dalje prisutan,
    eksplicitno tražio pravi log prije bilo kakvog drugog pokušaja umjesto
    nagađanja sljedećeg polyfilla. Svjež `vercel logs` potvrdio: DOMMatrix
    fix JEST uspio (taj specifičan crash više se ne pojavljuje), ali odmah
    iza njega novi, drugačiji crash:
    ```
    Error: Setting up fake worker failed: "Cannot find module
    '.../pdfjs-dist/legacy/build/pdf.worker.mjs'".
    ```
    Pravi uzrok pronađen čitanjem STVARNOG izvornog koda `pdfjs-dist`-a
    (`node_modules/pdfjs-dist/legacy/build/pdf.mjs`, `PDFWorker` klasa),
    ne dokumentacije ni nagađanja: u Node okruženju bez pravog Worker
    konteksta, pdfjs-dist radi "fake worker" (izvršava worker kod u istom
    procesu) preko `await import(this.workerSrc)`, gdje je `this.workerSrc`
    RUNTIME IZRAČUNATA vrijednost (`GlobalWorkerOptions.workerSrc`, string
    varijabla), NE statički string literal. Next-ov file tracer
    (`@vercel/nft`, isti mehanizam koji Vercel koristi da odluči koje
    datoteke ući u serverless bundle) prati SAMO statičke import
    specifiere - dinamički import s izračunatom putanjom je za njega
    nevidljiv, pa `pdf.worker.mjs` (2MB, stvarno potreban fajl za rad)
    nikad nije bio uključen u produkcijski bundle, iako fizički postoji u
    `node_modules`. Isti razred problema kao Prisma query engine binary
    (`next.config.mjs`-ov `PrismaPlugin`), samo za drugi paket.

    **Fix koristi pdfjs-dist-ov vlastiti, službeno podržani izlaz za točno
    ovaj slučaj** (vidljivo u `PDFWorker.#mainThreadWorkerMessageHandler`/
    `_setupFakeWorkerGlobal` getteru): ako je `globalThis.pdfjsWorker.
    WorkerMessageHandler` već postavljen PRIJE nego se worker treba
    pokrenuti, pdfjs-dist preskače dinamički import u potpunosti i koristi
    taj global izravno. `pdfText.ts` sad sam radi
    `import("pdfjs-dist/legacy/build/pdf.worker.mjs")` (i dalje unutar
    funkcije - zadržava odgodu iz buga #43, ne izvršava se dok se OCR
    stvarno ne pozove) i postavlja `globalThis.pdfjsWorker` prije poziva
    `pdf-parse`-a. Ključna razlika koja ovo čini traceable za razliku od
    pdfjs-dist-ovog internog poziva: specifier je STATIČKI STRING LITERAL
    (`"pdfjs-dist/legacy/build/pdf.worker.mjs"`), ne varijabla - Next-ov
    tracer prati dinamičke importe s literal putanjama, samo ne s
    izračunatim. `pdfjs-dist` dodan kao eksplicitna direktna ovisnost i
    `packages/api`-u i `apps/web`-u (isti razlog i obrazac kao `pdf-parse`
    u bugu #43 - tranzitivna ovisnost nije pouzdano resolvable odande gdje
    se ruta stvarno izvršava). Nova ambient `.d.ts` deklaracija
    (`pdfjs-worker.d.ts`, dupliciran u OBA paketa - `apps/web`-ov
    tsconfig `include` ne seže izvan vlastitog direktorija stabla, pa
    deklaracija iz `packages/api` nije vidljiva čak ni kad se `pdfText.ts`
    type-checka kao dio `apps/web` kompilacije preko `transpilePackages`)
    jer `pdfjs-dist` ne izvozi tipove za ovaj duboki worker subpath.

    **Verifikacija:** `tsc --noEmit` čist na oba paketa, `next build` čist,
    ekstrakcija protiv stvarnog Adriatic PDF-a lokalno i dalje vraća
    identičan tekst s oba fixa (DOMMatrix + worker) aktivna - nema
    regresije. Regresija-testirano protiv auth rute (bug #43 fix i dalje
    drži - `403`, ne crash). **Kao i za DOMMatrix crash, NIJE moguće
    lokalno reproducirati originalni worker crash** (Windows `next
    build`+`next start` nikad nije pucao ni za jedan od ova dva crasha,
    razlog te razlike između Windows i Vercelovog Linux runtimea nikad
    nije utvrđen ni za jedan slučaj) - čeka stvaran test u produkciji.
    Ako i OVAJ fix ne bude dovoljan, sljedeći korak je opcija (b) iz
    prijašnjeg zaključka - zamjena za `unpdf` ili sličnu biblioteku
    dizajniranu specifično za serverless okruženja bez canvas/worker
    ovisnosti.

---

## 3. Arhitektonske odluke i zašto

**Polica osiguranja: istek osiguranja kao proxy za istek registracije -
namjerna pretpostavka, ne konfuzija naziva.** `Vehicle.registrationExpiresAt`
je JEDINO polje u shemi za ovaj koncept (postojalo je prije OCR-a, kad se
ručno unosio). Kad je OCR ekstrakcija dodana za policu osiguranja, jedini
dostupan podatak na hrvatskim policama obveznog auto-osiguranja (AO) je
RAZDOBLJE OSIGURANJA (npr. "Trajanje osiguranja - Jednogodišnje" /
"Istek godišnjeg osiguranja: 07.07.2027.", potvrđeno na stvarnom Adriatic
primjeru) - police NE navode doslovno "istek registracije" kao svoje
polje. Pretpostavka (dokumentirana samo u kod komentaru dok korisnik nije
eksplicitno pitao je li namjerna ili slučajna): obvezno auto-osiguranje u
RH standardno prati valjanost registracije, jer obnova registracije
zahtijeva važeću policu za taj period - u praksi se datumi obično
poklapaju, ali ovo NIJE formalno potvrđeno za sve slučajeve (npr.
polica plaćena unaprijed na više godina, ili registracija obnovljena bez
odmah obnovljene police, teoretski mogu razići se). Odluka: **zadržati
JEDNO polje u bazi** (`registrationExpiresAt`, ne dodavati zaseban
`insuranceExpiresAt` - bila bi to veća shema promjena bez jasne
trenutne potrebe, vlasnik svejedno ručno potvrđuje/ispravlja prije
spremanja), ali **UI tekst mora biti precizan o izvoru** - notice poruke
i caption ispod OCR gumba (web + oba mobile ekrana) eksplicitno kažu
"istek osiguranja (procjena isteka registracije)", ne tvrde da je
doslovno pročitano polje "istek registracije". Ako se ikad pokaže da
razmimoilaženje nije rijetkost (korisnička povratna informacija iz
stvarne upotrebe), razdvajanje u zasebno polje postaje opravdano - do
tada, jedno polje s preciznijim UI opisom je dovoljno.

**OCR: vanjska vs. unutarnja strana prometne - dva odvojena slota, ne
jedan.** Korisnikov dizajn: prometna dozvola ima dvije fizičke strane s
potpuno različitim podacima - vanjska prikazuje registracijsku oznaku
veliko i jasno (bez tablice EU šifri), unutarnja ima tablicu harmoniziranih
EU šifri (D.1 marka, D.3 model, E VIN) ali NIKAD tablice. Prvobitna
implementacija (jedan `/api/ocr/registration-doc` endpoint koji je
pokušavao izvući SVE iz jedne slike) je zamijenjena s dva potpuno odvojena
endpointa/funkcije (`extractRegistrationInnerFields`/
`extractRegistrationOuterFields`) - svaki traži samo ono što ta strana
STVARNO sadrži, umjesto da oba pokušavaju sve pa se oslanjaju na to da
OCR/regex "ne nađe" ono čega nema. Vanjska strana koristi format-baziran
regex (ne label-baziran) jer Claude nema potvrđeno znanje o točnom OCR
tekstualnom rasporedu te strane, ali korisnik je potvrdio da je tablica
tamo standardno prikazana veliko i jasno - dovoljno za pouzdan
format-baziran pristup bez potrebe za referentnom slikom u prvom prolazu.
OCR slotovi su namjerno ODVOJENI od persistiranog "Spremi prometnu"
uploada (koji ostaje jedan dokument kao prije) - svaki OCR slot je čisto
ekstrakcija-za-prefill (ništa se ne uploada na Hetzner iz OCR poziva),
osim postojećeg "unutarnja strana" slota u `/vehicles/[id]` koji i dalje
ponovno koristi isti file koji je odabran za "Spremi prometnu" (praktičnost
- ne treba dva puta birati isti fajl ako vlasnik i tako fotografira i sprema
i skenira istu stranu). Polica osiguranja ima istu "svaki dokument svoj
OCR" konvenciju u dizajnu, ali OCR za nju (PDF text-parsing datuma isteka
registracije) je zaseban, još nedovršen Tier 2 korak - trenutno samo UI
caption najavljuje što će vaditi, bez nefunkcionalnog gumba.

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

**Client-mobile feature ekrani odgođeni, owner-mobile prioritet u modulu 7.**
Korisnikova odluka na početku faze 2. Cijeli signing/produženje/photo-request
flow već radi bez accounta preko token-linka u mailu (moduli 3, 5, 8), a
client-web portal već pokriva pregled za registrirane klijente (modul 6) -
native client app nema jasnu dodatnu vrijednost dok nema stvarnih klijenata
koji je traže. Dodatan praktičan razlog: client-facing JSON API rute za
ugovore/dokumente/potpis ne postoje još ni za web (portal je danas
server-rendered HTML, ne API) - client-mobile bi zahtijevao i taj backend
posao prije UI-ja, ne samo reuse postojećih ruta kao owner-mobile faza 2.

**Strukturirano polje za dio vozila (`VehiclePart` enum), odvojeno od
`PhotoAngle`.** Korisnikov zahtjev za prijavu oštećenja tražio je "koji dio
vozila" kao strukturiran podatak (ne slobodni tekst) radi budućeg
filtriranja/pretraživanja. `PhotoAngle` postojeće sheme predstavlja KUT
snimanja (front/back/left/right/interior/odometer), ne dio vozila - novi
`VehiclePart` enum (27 vrijednosti: branici, vrata, blatobrani, ogledala,
gume, svjetla, staklo, haube, prtljažnik, krov, unutrašnjost, ostalo) je
namjerno odvojen koncept. Slike prijavljenog oštećenja i dalje idu kroz
`HandoverPhoto` (isti model kao 4 obavezna kuta) s `angle: "other"` +
`damagedPart: VehiclePart` popunjenim - nije trebao novi model, samo novo
nullable polje (`damagedPart`, null za standardne 4 slike primopredaje).

**Damage-photo broj nije fiksan, pa se ne mogu koristiti fiksni FormData
ključevi kao za 4 obavezna kuta.** `photo_${angle}` obrazac (postojeći, za
front/back/left/right) radi jer je skup kutova statičan i poznat unaprijed.
Oštećenja su dinamičan popis (0 do N), pa signing wizard šalje `damageCount`
+ indeksirane `damage_${i}_part/photo/description` ključeve - backend ih
parsira u petlji `for (let i = 0; i < damageCount; i++)`.

**Gdje se unose novi Contract PDF podaci - owner pri kreiranju, klijent kod
potpisa, "povrat" polja nigdje još.** Korisnik je tražio da se predloži
mjesto unosa prije dodavanja polja. Odluka: `pickupLocation`,
`odometerStart`, `pricePerDay`, `excessAmount`, `paymentMethod` su poznati
OWNERU u trenutku kreiranja ugovora (cijena/uvjeti se dogovaraju prije
primopredaje) - dodano u `/contracts/new` formu, opcionalno. `address` je
realnije da OWNER ne zna unaprijed (klijent ga daje sa svojom osobnom) -
dodano u signing wizard "documents" korak, sprema se u istoj
`prisma.client.update` gdje se već ažurira `phone`. `returnLocation` i
`odometerEnd` NEMAJU ulazni flow u ovoj sesiji - opisuju stanje NAKON
najma (povrat vozila), a v1 nema "povrat vozila" značajku uopće (owner
danas nema nikakav ekran za "vozilo je vraćeno"). Polja su dodana u shemu
(nullable) da PDF format već postoji kad ta značajka jednom dođe - prijedlog
za buduću sesiju: prirodno bi pripadala u Tier 3 backlog stavku "Status
vozila: pod ugovorom / slobodno / na servisu" (vidi sekciju 7), gdje bi
"vrati vozilo" akcija postavila i status i ova dva polja odjednom.

**Company info u PDF-u je non-throwing (prazno umjesto pada signing flowa)
- za razliku od `OWNER_EMAIL` koji baca ako nedostaje.** Namjerno
asimetrično: `OWNER_EMAIL` je oduvijek bio required (bez njega se ne zna
kome poslati kopiju ugovora - kritično za postojeći, već produkcijski
flow). Novi `COMPANY_*` env varijable (`COMPANY_NAME/ADDRESS/OIB/PHONE/
EMAIL`) su dodane naknadno - da njihov izostanak sruši CIJELI signing flow
(koji je već produkcijski, ima stvarne korisnike) zbog praznog zaglavlja
PDF-a bilo bi nerazmjerno. `getCompanyInfo()` u `documents.ts` vraća prazan
string po polju umjesto bacanja; PDF prikazuje "—" gdje nedostaje.
**Korisnikova preostala akcija:** popuniti stvarne vrijednosti
(`COMPANY_ADDRESS`, `COMPANY_OIB`, `COMPANY_PHONE`) u `.env` i Vercel
env varijablama prije idućeg produkcijskog potpisa - trenutno će PDF
zaglavlje imati prazna polja za sve osim `COMPANY_NAME` (postavljen na
"NAVALIS-CISSA" u `.env.example` kao primjer/default, ali stvarni `.env`
treba provjeriti/postaviti ručno).

**`Contract.number` kao odvojeno autoincrement Int polje, ne zamjena za
cuid `id`.** Korisnik je tražio čitljiv sekvencijalni broj ugovora (za
"Ugovori" karticu na vozilu i za PDF), a predložio je točno ovaj pristup
("autoincrement integer polje na Contract modelu"). `id` ostaje cuid
(primary key, koristi se u URL-ovima, storage putanjama
`contracts/${id}/documents`, JWT signing tokenu `subjectId`, itd. - mijenjati
ga bi bio puno veći zahvat za nula stvarne koristi). `number Int @unique
@default(autoincrement())` je zaseban stupac s vlastitom Postgres
sekvencom, prikazan owneru/klijentu kao "broj ugovora" umjesto sirovog
cuid-a na PDF-u i u UI popisima. **Migracija je zahtijevala retroaktivno
popunjavanje** (izravno pitanje iz korisnikovog zahtjeva) - obična Prisma
`@default(autoincrement())` migracija bi Postgresu prepustila redoslijed
popunjavanja pri `ALTER TABLE` (obično fizički redoslijed redaka, ne
nužno isti kao `createdAt` redoslijed), pa je migracija ručno napisana
(isti obrazac kao bug #16 - `prisma migrate dev` ionako ne radi
neinteraktivno za ovakve promjene) s eksplicitnim `ROW_NUMBER() OVER
(ORDER BY "createdAt" ASC)` backfillom prije nego je kolona postala
`NOT NULL`+`UNIQUE`. Potvrđeno upitom nakon primjene: svih 16 postojećih
ugovora dobilo je brojeve 1-16 u točnom kronološkom redoslijedu.

---

## 4. Poznata ograničenja / svjesni kompromisi

1. ✅ **RIJEŠENO (vidi bug #34).** Slovo "đ" (i, ispostavilo se, i č/ć - ranija
   tvrdnja "Č, ć, š, ž rade ispravno" bila je netočna) u PDF tekstu je
   popravljeno embeddanim PT Sans fontom (`packages/api/src/pdf/fonts.ts`),
   primijenjeno globalno kroz `styles.ts` - pokriva i statički i dinamički
   tekst (imena, opisi oštećenja), za sva tri PDF template-a.

2. **Potpis u PDF-u nije auto-cropan** (`getCanvas()` umjesto
   `getTrimmedCanvas()`) — uključuje prazan prostor oko same crte potpisa.
   Kozmetičko, ne funkcionalno.

3. ✅ **RIJEŠENO.** `Contract.pricePerDay` dodan, unosi se u `/contracts/new`
   (web i mobile) i sad je **obavezno, pozitivan broj** na kreiranju
   ugovora (`contractCreateSchema`, `packages/api/src/schemas/contract.ts`)
   - ranija verzija ove bilješke tvrdila je "opcionalno", ali polje na
   mobileu uopće nije postojalo kao input dok se to nije provjerilo i
   dodalo (web input je postojao, ali bez `required`). `ContractPdf.tsx`
   prikazuje cijenu/dan, ukupno, PDV i osnovicu (računato).
10. **Placeholder tekst uvjeta najma u signing wizardu** (`TERMS_TEXT` u
    `sign/[token]/page.tsx`) - generički, nije pravni tekst. Kad stigne
    pravi tekst, MORA se promijeniti i `TERMS_VERSION` (npr. "v2") - to je
    vrijednost koja se sprema uz svaki potpisan ugovor, ključna za znati
    koju je verziju konkretni klijent stvarno vidio.
11. **`Contract.returnLocation`/`odometerEnd` nemaju ulazni flow.** Polja
    postoje u shemi (nullable), ContractPdf prikazuje "—", ali nema ekrana
    gdje bi se unijeli - v1 nema "povrat vozila" značajku. Vidi arhitektonsku
    odluku "Gdje se unose novi Contract PDF podaci" za prijedlog (Tier 3
    backlog).

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

8. **`apps/mobile` owner strana ima auth + sve core feature ekrane (modul 7,
   faze 1+2), client strana i dalje samo placeholder home bez podataka.**
   Owner: login/OTP kod/role-routing/logout (faza 1) + popis/detalj vozila
   s uploadima, popis/dodavanje klijenata, popis ugovora + kreiranje +
   photo request trigger (faza 2) — sve kodno gotovo, faza 2 još čeka live
   test na uređaju (vidi sekciju 5). Client-mobile feature ekrani su
   svjesno odgođeni (vidi arhitektonsku odluku niže) — nema pregleda
   ugovora/dokumenata/potpisa/produženja na mobileu za klijenta.

9. **Vlasnik (Owner) i test klijent dijele isti mail** (`b.malenica34@gmail.com`)
   jer je korisnik tražio test s vlastitim emailom. Zato callback nakon
   logina UVIJEK šalje tog usera na `/vehicles` (owner ima prioritet u
   redirect logici), čak i kad je login iniciran s `/portal/login` — treba
   ručno otići na `/portal` da se vidi client view. Ovo je očekivano
   ponašanje za taj specifični test account, ne bug.

   **Dodatak 2026-08-20 - dijagnoza prijavljenog "ugovor se ne šalje
   mailom".** Korisnik je prijavio da se ugovor "ne može otvoriti jer se ne
   uspijeva ni poslati mailom" i eksplicitno tražio uzrok prije bilo kakve
   promjene koda. Upit nad produkcijskom bazom (najnoviji ugovor,
   kreiran 2026-08-20T06:49:50Z) pokazao je `status: "sent"` i valjan,
   neistekao, još nepotpisan `signingToken` - mail flow je stvarno prošao
   do kraja (`createContractAndSendSigningEmail` ostavlja ugovor u
   `draft`-u BEZ tokena ako `sendContractSigningEmail` baci grešku prije
   završnog `prisma.contract.update` poziva; nula ugovora u bazi ima status
   `draft`, što isključuje neuhvaćenu grešku pri slanju kao uzrok). Klijent
   na tom ugovoru je `b.malenica34@gmail.com` - identičan `OWNER_EMAIL`.
   Zaključak u tom trenutku: nema dokaza stvarnog sloma u slanju; simptom
   je dosljedan s ovim već poznatim ograničenjem.

   **✅ Ovaj zaključak je bio POGREŠAN - ispravljeno istog dana, druga
   runda dijagnoze.** Korisnik je stvarno testirao s drugim (ne owner)
   emailom i i dalje dobio grešku, pa je zatražio pravi dokaz umjesto
   DB-posrednog zaključivanja. Pravi uzrok pronađen direktnim `vercel logs`
   uvidom + izravnim `curl` testom protiv produkcije: Vercelov ~4.5MB
   limit za tijelo Serverless Function zahtjeva (`413
   FUNCTION_PAYLOAD_TOO_LARGE`), potpuno nepovezano sa shared-email
   ograničenjem. Vidi bug #37 za pun dokazni lanac i fix (direct-to-storage
   upload). **Pouka za buduće sesije: DB stanje ("status je sent, token
   valjan") dokazuje da je taj KONKRETAN prijašnji pokušaj uspio, ne da
   NOVI prijavljeni pokušaj ne može biti pravi bug - closed-status
   podudarnost s poznatim ograničenjem je korelacija, ne dokaz uzroka.**

---

## 5. Sljedeći korak i preostali redoslijed

**Modul 7, Faza 1 (auth + skeleton) je gotova i live-testirana na pravom
uređaju — radi end-to-end** (login → OTP kod iz maila → `owner/home` s
pravim brojem vozila → logout, potvrdio korisnik). Konačni auth mehanizam
je OTP kod (ne magic-link deep link — vidi bug #28 zašto). Preostaje:

1. Za pravi client-only test (ne owner) treba drugi test email iz baze
   (vidi sekciju 6) jer owner i glavni test client dijele isti mail, pa
   `/api/auth/mobile/resolve` uvijek vraća `role: "owner"` za taj mail
   (identična prioritet-logika kao web callback, vidi ograničenje #9 dolje).
   Nije testirano ovom sesijom.

**Modul 7, Faza 2 (owner-mobile feature ekrani) je kodno gotova** — popis/
detalj vozila (uređivanje + upload prometne/police/slika), popis/dodavanje
klijenata, popis ugovora + kreiranje + "zatraži slike" trigger. `tsc
--noEmit` i `expo export` čisti. **Sljedeći korak: live test na uređaju**
(`pnpm --filter mobile start`, Expo Go) — navigacija kroz sve nove ekrane,
stvarni upload s telefonske kamere/galerije (permission dijalozi nisu
testirani izvan simulacije), kreiranje ugovora i provjera da signing mail
stigne identično kao s weba.

**Preostaje nakon toga u modulu 7** (nije još planirano u detalje):
- Client-mobile feature ekrani — svjesno odgođeno, vidi arhitektonsku
  odluku. Ako se ikad zatraži: treba i nove backend komade
  (`requireClientSession` helper + client-facing JSON API rute, portal je
  danas server-rendered HTML, ne API).
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

**Dopuna 2026-08-19:** čak i server-side resolve (admin `generateLink` +
ručni `fetch` s `redirect: "manual"` da se izvuče `Location` header s
`code` parametrom, pa navigacija Browser Pane-a IZRAVNO na taj
`localhost:3000/api/auth/callback?code=...` URL - izbjegava vanjsku
Supabase domenu koju Browser Pane blokira bez ručnog odobrenja) je moguć u
principu, ali korisnik je eksplicitno zaustavio taj pokušaj usred sesije
("previše vremena na to") i potvrdio da je za promjene ovog tipa (UI/forma
izmjene bez novih API ruta) typecheck+build+bundle export dovoljna
verifikacija. Ne pokušavati ponovno bez izričitog dogovora.

---

## 7. Backlog budućih razvojnih faza (po prioritetu)

Cijeli popis dao korisnik 2026-08-19. Tier 1 gotov (vidi modul 2 sekciju za
implementacijske detalje). Tier 2 započet 2026-08-21 (OCR prometne gotova,
vidi dnevnik na vrhu dokumenta i sekciju ispod). Tier 3-5 NISU dirani - čist
kontekst za buduće sesije, ne počinjati bez eksplicitnog dogovora.

**Tier 1 — UX brzina unosa** ✅ gotovo (ova sesija)
1. Padajući izbornici marka/model/godina na formi vozila
2. Brzi odabir početka najma (Danas/Sutra/Custom)
3. Trajanje najma kao broj dana → auto-izračun datuma povrata
4. (dopuna) Svi prikazani datumi u `DD.MM.GGGG.` formatu, web i mobile

**Tier 2 — Dokument-generacija i ekstrakcija** (obavezne stavke gotove)
- ✅ OCR ekstrakcija marke/modela/VIN-a (unutarnja strana) i registracije
  (vanjska strana), dva odvojena slota - **testirano uživo od korisnika,
  potvrđeno da radi** (uklj. VIN legenda-collision fix, bug #41)
- ✅ Datum isteka registracije vaditi iz police osiguranja (PDF,
  tekst-parsing), NE s prometne (pečat prekriva datum na fizičkom
  dokumentu) - kodno gotovo i runtime-verificirano (bug #42, sintetički
  PDF-ovi kroz stvarnu rutu), **čeka prvi test na stvarnoj polici** -
  heuristika za naziv polja nije potvrđena protiv pravog dokumenta
- ⏳ Opcionalno: OCR ekstrakcija osobne/vozačke za prefil client podataka u
  ugovoru - nije rađeno (nikad nije bila obavezna stavka)
- ⏳ Generator punomoći za registraciju vozila (PDF, fiksni predložak: podaci
  tvrtke + vozila + zaposlenika, print-ready) - vozila su vlasništvo
  tvrtke, zaposlenici idu registrirati - nije rađeno

**Tier 3 — Status vozila i pregled flote** (nije dirano)
- Status vozila: pod ugovorom / slobodno / na servisu
- Povijest najma po vozilu, numeriranje ugovora

**Tier 4 — Servis i statistika** (nije dirano)
- Unos servisa po vozilu, povijest servisa, statistika vozila

**Tier 5 — Financije** (nije dirano, korisnik eksplicitno tražio istraživanje
zakonskih zahtjeva PRIJE koda)
- Izdavanje R1 računa
- Stripe plaćanje
- Generiranje barkoda za plaćanje
- R2 računi
