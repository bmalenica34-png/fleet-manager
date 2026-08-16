import { NextResponse } from "next/server";
import { runExpiringContractsCheck } from "@rent-a-car/api/server";
import { isAuthorizedCronRequest } from "@/lib/verifyCronSecret";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runExpiringContractsCheck();
  return NextResponse.json(result);
}
