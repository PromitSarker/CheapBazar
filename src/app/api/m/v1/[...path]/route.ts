import { router } from "@/lib/mobile/routes";

export const dynamic = "force-dynamic";

async function dispatch(req: Request, { params }: { params: { path: string[] } }) {
  return router.handle(req, "/" + (params.path ?? []).join("/"));
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
