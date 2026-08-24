-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnja dva nastavka: shadow-DB replay pada na pre-postojećoj migraciji
-- 20260820073000_add_contract_number, pa se koristi `migrate deploy` (bez
-- shadow baze) izravno na produkcijsku bazu.

-- CreateSequence (za TermsAndConditions.version @default(autoincrement()) -
-- sekundarna kolona, ne primary key, isti mehanizam kao Contract.number)
CREATE SEQUENCE "terms_and_conditions_version_seq";

-- CreateTable
CREATE TABLE "terms_and_conditions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT nextval('terms_and_conditions_version_seq'),
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_and_conditions_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE "terms_and_conditions_version_seq" OWNED BY "terms_and_conditions"."version";

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "termsVersionId" TEXT;
ALTER TABLE "contracts" ADD COLUMN "termsPdfKey" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "terms_and_conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed v1 = trenutni hardkodirani placeholder tekst iz sign/[token]/page.tsx
-- (TERMS_TEXT konstanta, uklonjena ovom promjenom) - garantira kontinuitet:
-- svaki signing link koji je već otvoren prije ovog deploya i dalje vidi
-- IDENTIČAN tekst nakon deploya, samo sad iz baze umjesto hardkodirano.
INSERT INTO "terms_and_conditions" ("id", "content", "active", "createdAt")
VALUES (
  'terms-v1-seed-placeholder',
  $TERMS$1. Predmet ugovora
Ovim Uvjetima najma uređuju se prava i obveze najmodavca i najmoprimca u vezi s najmom vozila opisanog u ugovoru. Potpisom ugovora najmoprimac potvrđuje da je pročitao, razumio i prihvatio ove uvjete u cijelosti.

2. Korištenje vozila
Vozilo smije upravljati isključivo osoba navedena kao najmoprimac (ili dodatni vozač naveden u ugovoru), koja posjeduje važeću vozačku dozvolu odgovarajuće kategorije. Vozilo se ne smije koristiti za prijevoz osoba ili stvari uz naknadu, sudjelovanje u utrkama ili testiranjima, vuču drugih vozila, ili bilo koju drugu svrhu suprotnu njegovoj namjeni.

3. Stanje vozila i primopredaja
Najmoprimac potvrđuje da je vozilo preuzeo u ispravnom stanju, bez vidljivih oštećenja osim onih izričito navedenih u primopredajnom zapisniku i pripadajućim fotografijama. Najmoprimac je dužan vratiti vozilo u istom stanju, uz uobičajeno trošenje, na dogovorenom mjestu i u dogovoreno vrijeme.

4. Gorivo
Vozilo se predaje s određenom količinom goriva i mora se vratiti s istom količinom, osim ako je drugačije dogovoreno. U protivnom, najmodavac zadržava pravo naplate razlike goriva uvećane za trošak usluge točenja.

5. Odgovornost za štetu
Najmoprimac odgovara za svu štetu nastalu na vozilu tijekom trajanja najma, do iznosa učešća u šteti navedenog u ugovoru, osim ako je šteta nastala krivnjom treće strane uz uredno prijavljen policijski zapisnik. U slučaju prometne nezgode, najmoprimac je obavezan odmah obavijestiti policiju i najmodavca.

6. Produženje najma
Svako produženje razdoblja najma mora biti unaprijed dogovoreno s najmodavcem i potvrđeno pisanim putem (aneksom ugovora). Neovlašteno zadržavanje vozila nakon isteka ugovorenog razdoblja smatra se kršenjem ugovora.

7. Obrada osobnih podataka
Najmodavac obrađuje osobne podatke najmoprimca isključivo u svrhu izvršenja ovog ugovora, sukladno važećim propisima o zaštiti osobnih podataka, te ih ne ustupa trećim stranama osim kada je to zakonski obvezno.

8. Završne odredbe
Za sve što nije uređeno ovim uvjetima primjenjuju se odredbe Zakona o obveznim odnosima i drugih važećih propisa Republike Hrvatske. Eventualni sporovi rješavaju se sporazumno, a u slučaju spora nadležan je sud prema sjedištu najmodavca.$TERMS$,
  true,
  CURRENT_TIMESTAMP
);
