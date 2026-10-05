import { publicRequest } from "@/server/cloud/public";
import { safeFailure } from "@/server/cloud/clients";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await publicRequest(request, (await context.params).path);
  } catch (error) {
    return safeFailure(error);
  }
}
export { handle as GET, handle as POST };
