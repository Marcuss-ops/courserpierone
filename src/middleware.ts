import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function proxy(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Admin routes — require admin role
    if (pathname.startsWith("/admin")) {
      if (token?.role !== "admin") {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    // API routes that mutate data — require valid session
    if (pathname.startsWith("/api/translate") || pathname.startsWith("/api/config") || pathname.startsWith("/api/upload")) {
      if (token?.role !== "admin") {
        return NextResponse.json(
          { error: "Unauthorized — admin access required" },
          { status: 403 }
        );
      }
    }

    // Set locale cookie from ?lang= query param (per dynamic <html lang>)
    const lang = req.nextUrl.searchParams.get("lang");
    const response = NextResponse.next();
    if (lang && /^[a-z]{2,5}$/.test(lang)) {
      response.cookies.set("locale", lang, {
        path: "/",
        maxAge: 60 * 60 * 24, // 24 ore
        sameSite: "lax",
      });
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Public paths: allow without auth
        if (
          pathname.startsWith("/_next") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/analytics") ||
          pathname.startsWith("/api/access") ||
          pathname.startsWith("/api/checkout") ||
          pathname.startsWith("/api/webhooks") ||
          pathname.startsWith("/api/magic-link") ||
          pathname.startsWith("/api/products") ||
          pathname.startsWith("/login") ||
          pathname === "/" ||
          (/^\/[^/]+$/.exec(pathname)) // landing pages (e.g. /lumio, /corso-slug)
        ) {
          return true;
        }

        // Admin routes — must have admin role
        if (pathname.startsWith("/admin")) {
          return !!token && token.role === "admin";
        }

        // All other routes — require at least a valid session
        return !!token;
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export const config = {
  matcher: [
    // Match all routes except static files, _next static, and public api endpoints
    "/((?!_next/static|_next/image|favicon.ico|images/|courses/).*)",
  ],
};
