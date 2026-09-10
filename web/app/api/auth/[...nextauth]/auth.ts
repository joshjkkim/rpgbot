import DiscordProvider from "next-auth/providers/discord";
import type { JWT } from "next-auth/jwt";
import type { NextAuthOptions } from "next-auth";

// Discord access tokens last seven days. Without a refresh the dashboard works
// for a week and then every call to Discord's API 401s -- which used to surface
// as a 503, so an expired login looked like an outage. The refresh token is
// captured at sign-in and spent when the access token is close to expiring.

/** Refresh a minute early, so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken;

  // Nothing to spend: the session predates this code, or a previous refresh
  // already failed and cleared it.
  if (!refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });

    const refreshed = await res.json();
    if (!res.ok) throw new Error(`Discord refused the refresh: ${res.status}`);

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      // Discord rotates the refresh token. Keeping the old one on a response
      // that omits it would spend a dead token on the next refresh.
      refreshToken: refreshed.refresh_token ?? refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Failed to refresh Discord access token:", error);
    // Drop the tokens rather than retry a refresh Discord has already rejected
    // (a revoked authorisation never starts working again). `error` is what the
    // API routes turn into a 401, so the user is asked to sign in again.
    return {
      ...token,
      accessToken: undefined,
      refreshToken: undefined,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // Sign-in: `account` is only present on the first call.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at
            ? account.expires_at * 1000 // Discord returns seconds, JS wants ms.
            : Date.now() + 604_800_000, // Seven days, Discord's default.
          error: undefined,
        };
      }

      const expiresAt = token.expiresAt;
      if (typeof expiresAt === "number" && Date.now() < expiresAt - EXPIRY_SKEW_MS) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      // The client reads this to send the user back through sign-in instead of
      // showing a generic failure.
      session.error = token.error;
      return session;
    },
  },
};
