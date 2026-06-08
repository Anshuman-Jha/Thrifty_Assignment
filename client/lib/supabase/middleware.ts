import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSkipAuth } from "@/lib/demo";

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const skip = isSkipAuth();

  if (skip && (path === "/auth/login" || path === "/auth/signup")) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    if (skip) {
      return NextResponse.next({ request });
    }
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const isAuthPage =
    path.startsWith("/auth") && !path.startsWith("/auth/callback");
  const isProtected =
    path.startsWith("/app") || path.startsWith("/workspace");

  // Optimization: skip Supabase auth check on public routes to prevent Vercel edge timeout (504)
  if (skip || (!isAuthPage && !isProtected)) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthPage && user && (path === "/auth/login" || path === "/auth/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
