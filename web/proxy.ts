import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends a signed-out visitor to sign in, remembering the exact dashboard page
 * they asked for, so a link from Discord (the welcome message's "Set up with a
 * starter pack", say) lands on that page afterwards. The guild layout can't do
 * this itself: layouts never see the child path.
 *
 * Only checks that a session cookie exists. The layout still verifies the
 * session and that the visitor owns the server.
 */
export function proxy(request: NextRequest) {
  const { cookies, nextUrl } = request;
  if (cookies.has("next-auth.session-token") || cookies.has("__Secure-next-auth.session-token")) {
    return NextResponse.next();
  }
  const signIn = new URL("/", request.url);
  signIn.searchParams.set("callbackUrl", nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = { matcher: "/dashboard/:guildId/:path*" };
