import { NextResponse } from "next/server";
import { createPhotoRequestUploadUrl } from "@rent-a-car/api/server";
import { photoRequestUploadRequestSchema } from "@rent-a-car/api";

export const runtime = "nodejs";

// Isti obrazac kao /api/sign/[token]/upload-url - klijent traži presigned
// PUT URL po slici i uploada izravno u Hetzner, mimo Vercel funkcijskog
// tijela (vidi bugove #37/#38 u PROGRESS.md).
export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const json = await request.json().catch(() => null);
  const parsed = photoRequestUploadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await createPhotoRequestUploadUrl(
    params.token,
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
