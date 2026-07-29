import { type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { kstNow } from "@/lib/time";
import { isUuid } from "@/lib/validation";
import { getMemberScheduleList } from "@/services/schedule";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? kstNow().format("YYYY-MM-DD");
    const requestedBranchId = request.nextUrl.searchParams.get("branchId");
    const branchId = requestedBranchId && requestedBranchId !== "all" && isUuid(requestedBranchId) ? requestedBranchId : undefined;
    const scope = await requireMemberScope();
    return Response.json(await getMemberScheduleList(scope.memberId, date, branchId));
  } catch (error) {
    return errorResponse(error);
  }
}
