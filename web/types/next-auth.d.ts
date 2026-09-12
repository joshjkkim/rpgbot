// The Discord OAuth tokens the dashboard carries on the session. NextAuth's own
// JWT is `Record<string, unknown>`, so without this the refresh code in
// `app/api/auth/[...nextauth]/auth.ts` reads every field as `unknown`.
import "next-auth";
import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Epoch milliseconds. Discord reports seconds; the callback converts. */
    expiresAt?: number;
    /** Set when a refresh failed and the user has to sign in again. */
    error?: "RefreshAccessTokenError";
  }
}

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
  }
}
