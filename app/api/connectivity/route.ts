// Reachability only: no authentication, database query, printer work, or cached response.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ service: "rdv-order" }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
