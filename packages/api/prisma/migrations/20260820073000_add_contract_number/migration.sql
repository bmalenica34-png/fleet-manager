-- Dodaje sekvencijalni "broj ugovora" (Contract.number), odvojeno od cuid
-- primary key-a (id). Ručno napisana migracija (ne prisma migrate dev - vidi
-- bug #16 u PROGRESS.md) jer default `prisma migrate dev` generacija ne bi
-- popunila postojeće retke, a Contract tablica već ima test ugovore.

-- 1) Dodaj nullable kolonu.
ALTER TABLE "contracts" ADD COLUMN "number" INTEGER;

-- 2) Retroaktivno popuni postojeće retke, numerirano po createdAt (redoslijed
--    stvarnog kreiranja ugovora), ne po fizičkom redoslijedu redaka u tablici.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "contracts"
)
UPDATE "contracts" c
SET "number" = numbered.rn
FROM numbered
WHERE c."id" = numbered."id";

-- 3) Sequence za buduće redke, startana iznad najvišeg postojećeg broja.
CREATE SEQUENCE IF NOT EXISTS "contracts_number_seq" OWNED BY "contracts"."number";
SELECT setval('"contracts_number_seq"', COALESCE((SELECT MAX("number") FROM "contracts"), 0));
ALTER TABLE "contracts" ALTER COLUMN "number" SET DEFAULT nextval('"contracts_number_seq"');

-- 4) Sad kad su svi retci popunjeni, kolona može postati NOT NULL + unique.
ALTER TABLE "contracts" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");
