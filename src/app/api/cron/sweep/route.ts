import { AppError, errorResponse } from "@/lib/errors";
import { sweepAllWaitlists } from "@/services/waitlist";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new AppError("ERR_UNAUTHORIZED");
    }
    return Response.json(await sweepAllWaitlists());
  } catch (error) {
    return errorResponse(error);
  }
}
