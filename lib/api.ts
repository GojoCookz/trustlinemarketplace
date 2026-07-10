import { NextResponse } from "next/server";

export function apiSuccess(data: unknown) {
  return NextResponse.json({ success: true, data });
}

export function apiError(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}
