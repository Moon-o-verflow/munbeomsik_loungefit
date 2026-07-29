import { setManagerSessionCookie } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { authenticateManager } from "@/services/manager-auth";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const loginId = typeof body === "object" && body !== null ? (body as { loginId?: unknown }).loginId : undefined;
    const password = typeof body === "object" && body !== null ? (body as { password?: unknown }).password : undefined;
    if (typeof loginId !== "string" || loginId.length === 0 || typeof password !== "string" || password.length === 0) {
      throw new AppError("ERR_INVALID_REQUEST");
    }
    const result = await authenticateManager(loginId, password);
    await setManagerSessionCookie(result.token);
    return Response.json({ manager: result.manager });
  } catch (error) {
    return errorResponse(error);
  }
}
