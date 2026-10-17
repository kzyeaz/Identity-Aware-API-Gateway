import { NextResponse } from "next/server";
import { getToken, isSimulation } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const identity = new URL(request.url).searchParams.get("identity") === "reader" ? "reader" : "writer";
  const headers = { "Cache-Control": "no-store" };
  if (isSimulation()) return NextResponse.json({
    mode: "simulation", iss: "http://localhost:8180/realms/identity", sub: `demo-${identity}`,
    aud: ["identity-api"], scope: identity === "writer" ? "projects:read projects:write" : "projects:read",
    azp: `demo-${identity}`, note: "Illustrative claims. No JWT is issued in simulation mode."
  }, { headers });
  try {
    const token = await getToken(identity);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    // This is an inspector, not an authorization decision. Spring verifies the original token.
    return NextResponse.json({ mode: "live", iss: claims.iss, sub: claims.sub, aud: claims.aud,
      scope: claims.scope, azp: claims.azp, exp: claims.exp }, { headers });
  } catch {
    return NextResponse.json({ error: "Identity provider unavailable" }, { status: 503, headers });
  }
}
