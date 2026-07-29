import { errorResponse } from "@/lib/errors";
import { requireMemberScope } from "@/lib/scope";
import { getMemberTickets } from "@/services/ticket";

export async function GET() {
  try {
    const scope = await requireMemberScope();
    return Response.json(await getMemberTickets(scope.memberId));
  } catch (error) {
    return errorResponse(error);
  }
}
