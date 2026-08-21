// Google Cloud Vision REST klijent (ne @google-cloud/vision SDK, koji
// očekuje service-account JSON) - GOOGLE_VISION_API_KEY je goli API key pa
// je jednostavan `fetch` protiv `images:annotate` dovoljan i bez dodatne
// ovisnosti.
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function getApiKey(): string {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    throw new Error("Missing required env var: GOOGLE_VISION_API_KEY");
  }
  return key;
}

// DOCUMENT_TEXT_DETECTION (ne obični TEXT_DETECTION) - bolji za guste
// dokumente s tablicama polja kao prometna dozvola, prema Google
// dokumentaciji.
export async function detectDocumentText(imageBuffer: Buffer): Promise<string> {
  const res = await fetch(`${VISION_ENDPOINT}?key=${getApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBuffer.toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Vision API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message: string } }[];
  };
  const response = data.responses?.[0];
  if (response?.error) {
    throw new Error(`Google Vision API error: ${response.error.message}`);
  }
  return response?.fullTextAnnotation?.text ?? "";
}
