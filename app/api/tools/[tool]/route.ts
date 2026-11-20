import { after, NextResponse } from "next/server";
import { toolAuthorized } from "@/lib/auth";
import { runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// URL uses kebab-case (/api/tools/check-medication), tool names use snake_case.
export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  if (!toolAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { tool } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const { status, body: out, background } = await runTool(tool.replace(/-/g, "_"), body);
  if (background) after(background);
  return NextResponse.json(out, { status });
}
