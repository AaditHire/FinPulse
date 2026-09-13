import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // The dashboard is public and uses browser-local holdings for anonymous visitors.
  // API handlers continue to enforce authentication for private data and mutations.
  if (request.nextUrl.pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
