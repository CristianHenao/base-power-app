import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve the team playbook from the repo root so there is one copy to edit.
// Built at compile time; the proxy still requires sign-in for this path.
export const dynamic = "force-static";

const PLAYBOOK_PATH = path.join(process.cwd(), "Porchlight team playbook.html");

export async function GET() {
  const html = await readFile(PLAYBOOK_PATH, "utf8");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
