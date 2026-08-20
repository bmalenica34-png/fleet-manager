// Postavlja CORS politiku na Hetzner Object Storage bucketu - potrebno da
// bi presigned PUT upload (signing wizard, vidi bug #37 u PROGRESS.md)
// uopće radio iz pravog browsera. Ovo NIJE dio koda koji se deploya -
// bucket-level konfiguracija se postavlja ručno pokretanjem ovog scripta
// (idempotentno, siguran za re-run), izvan CI/CD toka. Ako se bucket ikad
// obriše/rekreira, ili se doda novi produkcijski domain, ovo se MORA
// ponovno pokrenuti.
//
// Napomena otkrivena tijekom debugiranja: čisti "AllowedMethods: [PUT],
// AllowedHeaders: [content-type]" (bez GET/POST/HEAD u AllowedMethods, bez
// ExposeHeaders) je dovoljan da Hetznerov Ceph RGW ispravno odgovori na
// OPTIONS preflight, ALI stvarni PUT odgovor je i dalje bio bez
// `Access-Control-Allow-Origin` headera - browser blokira takav odgovor
// unatoč uspješnom preflightu ("Failed to fetch", bez ikakvog HTTP statusa
// vidljivog u JS-u). Širi pravilo (GET/PUT/POST/HEAD + wildcard headeri +
// ExposeHeaders) je popravio i stvarni PUT odgovor - točan uzrok te razlike
// nije istražen dublje (Ceph RGW CORS implementacija), ali fix je potvrđen
// izravno kroz pravi browser (Claude Browser Pane, ne curl - curl ne
// provodi CORS pa ne bi uhvatio ovaj razred buga).
//
// Pokretanje: cp ../../.env .env && node --env-file=.env scripts/configure-hetzner-cors.mjs && rm .env

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const client = new S3Client({
  endpoint: requiredEnv("HETZNER_S3_ENDPOINT"),
  region: process.env.HETZNER_S3_REGION ?? "eu-central",
  forcePathStyle: true,
  credentials: {
    accessKeyId: requiredEnv("HETZNER_S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("HETZNER_S3_SECRET_ACCESS_KEY"),
  },
});

const bucket = requiredEnv("HETZNER_S3_BUCKET");

// Ažurirati ovaj popis kad se doda novi produkcijski domain (npr. custom
// domain umjesto *.vercel.app aliasa).
const allowedOrigins = [
  "https://fleet-manager-web-ten.vercel.app",
  "https://fleet-manager-web-branimir-s-projects1.vercel.app",
  "http://localhost:3000",
];

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: allowedOrigins,
          AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
);

const check = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log("CORS policy applied and verified:", JSON.stringify(check.CORSRules, null, 2));
