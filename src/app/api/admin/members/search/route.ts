import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { searchAdminMembers } from "@/services/admin-members";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    return Response.json({ members: await searchAdminMembers(await requireAdminScope(), query) });
  } catch (error) {
    return errorResponse(error);
  }
}
