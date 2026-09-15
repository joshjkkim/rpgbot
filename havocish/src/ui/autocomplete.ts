import type { AutocompleteInteraction } from "discord.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { shopItemConfig } from "../types/economy.js";

type Choice = { name: string; value: string };

/**
 * Answers with the choices matching what the member has typed so far. Discord
 * shows at most 25, and caps names and values at 100 characters. The value
 * stays the raw ID, so typing an ID by hand still works.
 */
export async function respondFiltered(interaction: AutocompleteInteraction, choices: Choice[]) {
    const typed = interaction.options.getFocused().toLowerCase();
    const matches = choices
        .filter((c) => c.name.toLowerCase().includes(typed) || c.value.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((c) => ({ name: c.name.slice(0, 100), value: c.value.slice(0, 100) }));
    await interaction.respond(matches);
}

function itemLabel(id: string, def: shopItemConfig | undefined, quantity?: number) {
    const name = `${def?.emoji ?? ""} ${def?.name ?? id}`.trim();
    return quantity == null ? name : `${name} ×${quantity}`;
}

/** Items in the member's own inventory, optionally narrowed (e.g. to equipable ones). */
export async function autocompleteOwnedItems(
    interaction: AutocompleteInteraction,
    keep: (def: shopItemConfig | undefined) => boolean = () => true,
) {
    if (!interaction.guildId) return interaction.respond([]);

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const defs = config.shop?.items ?? {};

    const choices = Object.entries(profile.inventory ?? {})
        .filter(([id, owned]) => (owned?.quantity ?? 0) > 0 && keep(defs[id]))
        .map(([id, owned]) => ({ name: itemLabel(id, defs[id], owned.quantity), value: id }));

    await respondFiltered(interaction, choices);
}

/** Every item the server defines, for admin commands. */
export async function autocompleteShopItems(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) return interaction.respond([]);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const choices = Object.entries(config.shop?.items ?? {}).map(([id, def]) => ({ name: itemLabel(id, def), value: id }));

    await respondFiltered(interaction, choices);
}
