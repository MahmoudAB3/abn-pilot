import { NextRequest, NextResponse } from "next/server";

/**
 * - En-têtes de sécurité et CSP stricte à nonce (scripts) pour chaque page.
 * - Redirection vers /connexion sans cookie de session (contrôle de confort :
 *   la validité réelle de la session et de l'appartenance est vérifiée côté serveur).
 * - Mémorise le projet consulté (/projets/ERP/…) comme projet courant.
 */
const PUBLIC = [/^\/connexion/, /^\/api\//, /^\/_next\//, /^\/icon/, /^\/favicon/];
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((r) => r.test(pathname));
  if (!isPublic && !SESSION_COOKIES.some((c) => req.cookies.has(c))) {
    const url = new URL("/connexion", req.url);
    if (pathname !== "/") url.searchParams.set("retour", pathname);
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://accounts.google.com https://github.com",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  if (!pathname.startsWith("/api/")) res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.nextUrl.protocol === "https:") res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

  const m = pathname.match(/^\/projets\/([A-Z][A-Z0-9]{1,9})(\/|$)/);
  if (m && req.cookies.get("pilotage-project")?.value !== m[1]) {
    res.cookies.set("pilotage-project", m[1]!, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31536000 });
  }
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|icon.svg|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
