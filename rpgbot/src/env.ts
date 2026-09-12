/**
 * Fails fast, and loudly, when the process is missing configuration it cannot
 * run without.
 *
 * The failure this exists to prevent: with DATABASE_URL unset, `pg` does not
 * complain. It quietly falls back to a localhost connection, so the bot logs
 * into Discord, looks healthy, accepts commands, and every single write fails
 * with ECONNREFUSED. A bot that is up but amnesiac is worse than one that
 * refused to start, so refuse to start.
 *
 * Call assertBotEnv() before client.login(), not after. The pg Pool is built
 * at module-evaluation time but does not connect until its first query, so
 * checking from the body of index.ts is early enough -- as long as it happens
 * before the bot starts answering anyone.
 */

/** Variables the bot process cannot start without. */
export const REQUIRED_ENV = ["DISCORD_TOKEN", "DATABASE_URL"] as const;

/**
 * Needed only by `npm run deploy-commands` / `deploy-test-commands`, which are
 * run by hand from a developer machine. A deployed container never registers
 * slash commands, so these stay out of REQUIRED_ENV -- demanding them would
 * make a perfectly correct production environment fail to boot.
 */
export const DEPLOY_ONLY_ENV = ["CLIENT_ID", "SERVER_ID"] as const;

/** The names in `names` that are unset, empty, or whitespace. */
export function missingEnv(names: readonly string[]): string[] {
    return names.filter((name) => !process.env[name]?.trim());
}

/** Exits the process (78, EX_CONFIG) if anything in REQUIRED_ENV is missing. */
export function assertBotEnv(): void {
    const missing = missingEnv(REQUIRED_ENV);
    if (missing.length === 0) return;

    const plural = missing.length === 1 ? "variable is" : "variables are";
    console.error(`\nCannot start: required environment ${plural} not set.\n`);
    for (const name of missing) console.error(`  - ${name}`);
    console.error(
        "\nCopy rpgbot/.env.example to rpgbot/.env and fill it in, or set these in\n" +
        "the environment the container runs with. See README.md.\n\n" +
        "DATABASE_URL must be quoted in .env: a hosted connection string contains\n" +
        "`&`, which an unquoted value turns into an empty string under\n" +
        "`set -a; . .env; set +a`.\n"
    );
    process.exit(78); // EX_CONFIG
}
