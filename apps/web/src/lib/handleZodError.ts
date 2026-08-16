import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function zodErrorResponse(error: ZodError) {
  return NextResponse.json(
    { error: "validation_error", issues: error.flatten() },
    { status: 400 }
  );
}
