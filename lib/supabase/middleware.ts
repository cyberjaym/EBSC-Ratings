import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { extractSubdomain } from "@/lib/subdomain.mjs";

// Root domain for this deployment, e.g. "yourapp.com" in production or
// "lvh.me:3000" in local dev (lvh.me resolves to 127.0.0.1, giving real
// wildcard-subdomain behavior — tenanta.lvh.me:3000 — without owning a
// domain yet).
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() (not getSession()) — this revalidates the token against the
  // Supabase Auth server on every request rather than trusting a cookie
  // that could be stale or forged.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const subdomain = extractSubdomain(request.headers.get("host") || "", ROOT_DOMAIN);
  response.headers.set("x-tenant-subdomain", subdomain);

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
