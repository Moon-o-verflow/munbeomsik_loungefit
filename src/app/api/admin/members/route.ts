import type { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { requireAdminScope } from "@/lib/scope";
import { getAdminMemberList } from "@/services/admin-members";

export async function GET(request: NextRequest) {
  try {
    const pageValue = request.nextUrl.searchParams.get("page") ?? "1";
    const page = Number(pageValue);
    const filter = request.nextUrl.searchParams.get("filter") ?? "all";
    if (!Number.isSafeInteger(page) || page < 1 || !["all", "suspended", "noshow"].includes(filter)) {
      throw new AppError("ERR_INVALID_REQUEST");
    }
    return Response.json(await getAdminMemberList(await requireAdminScope(), {
      page,
      keyword: request.nextUrl.searchParams.get("keyword") ?? "",
      filter: filter as "all" | "suspended" | "noshow",
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
