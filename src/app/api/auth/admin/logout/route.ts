import { clearManagerSessionCookie } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function POST() {
  try {
    await clearManagerSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
