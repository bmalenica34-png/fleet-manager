import { NextResponse } from "next/server";
import { createSignUploadUrl } from "@rent-a-car/api/server";
import { signUploadRequestSchema } from "@rent-a-car/api";

export const runtime = "nodejs";

// Klijent traži presigned PUT URL po fajlu i uploada izravno u Hetzner,
// mimo Vercel funkcijskog tijela - vidi bug #37 u PROGRESS.md
// (multipart-kroz-funkciju je udarao u ~4.5MB platformski limit čim se
// dokumenti + 4 slike + oštećenja zbroje).
export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const json = await request.json().catch(() => null);
  const parsed = signUploadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await createSignUploadUrl(
    params.token,
    parsed.data.purpose,
    parsed.data.filename,
    parsed.data.contentType,
    parsed.data.angle
  );

  if (!result.ok) {
    const status = result.error === "invalid" ? 404 : 410;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ key: result.key, uploadUrl: result.uploadUrl });
}
