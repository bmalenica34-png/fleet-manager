import { NextResponse } from "next/server";
import { createPhotoRequestAndSendEmail } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "contracts");
  if (!auth.authorized) return auth.response;

  try {
    const photoRequest = await createPhotoRequestAndSendEmail(params.id);
    return NextResponse.json(photoRequest, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 }
    );
  }
}
