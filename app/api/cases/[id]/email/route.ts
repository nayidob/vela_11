import { getCase } from "@/lib/cases";

export const dynamic = "force-dynamic";

/** Renders the patient confirmation email exactly as it was sent (or would be). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCase(id);
  if (!c?.emailHtml) return new Response("No email for this case yet.", { status: 404 });
  return new Response(c.emailHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
