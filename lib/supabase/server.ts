import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// For use in Server Components / Server Actions / Route Handlers. Reads the
// signed-in user's session from cookies, so every query issued through this
// client carries their real JWT — RLS enforces tenant scoping exactly as
// proven in test/live-auth-isolation.test.mjs.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component during render, where cookies
            // can't be set — harmless as long as middleware.ts also runs
            // and refreshes the session on every request.
          }
        },
      },
    }
  );
}
