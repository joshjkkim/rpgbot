/**
 * Loads the scratch-database env before anything else is imported.
 *
 * This has to be its own module: `src/db/index.ts` constructs its pg Pool at
 * module-evaluation time from process.env.DATABASE_URL, and ESM evaluates all
 * imports before the importing module's body runs. Calling dotenv inside
 * smoke.ts would therefore happen *after* the Pool had already been built
 * against an empty DATABASE_URL (and silently defaulted to localhost).
 *
 * Imported first by smoke.ts, so it wins the evaluation order.
 */
import { config as loadEnv } from "dotenv";

// Base config first, then .env.test with override so the scratch database
// always wins. Relying on load order alone is not enough - dotenv's precedence
// between multiple files is a footgun, and getting it backwards here would
// point the tests at production.
loadEnv({ quiet: true });
loadEnv({
    path: new URL("../.env.test", import.meta.url).pathname,
    override: true,
    quiet: true,
});
