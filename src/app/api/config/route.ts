import { connection } from "next/server";

// Public Supabase settings, read when the request arrives rather than when the app was built.
// This keeps the app working if the hosting provider only exposes variables at runtime.
export async function GET() {
  await connection();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  return Response.json({ url, anonKey }, { headers: { "Cache-Control": "no-store" } });
}
