import { privateRequest } from "@/server/cloud/private";
import { safeFailure } from "@/server/cloud/clients";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    return await privateRequest(request, (await context.params).path);
  } catch (error) {
    return safeFailure(error);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
