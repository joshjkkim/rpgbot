import { Client, VoiceState, Events } from "discord.js";
import { activeVCSessions, getActiveVCSessionKey, onLeaveVoiceChannel } from "../db/activeVC.js";

export function registerVoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
        if (oldState.channelId === newState.channelId) {
            return; // No change in voice channel
        }

        console.log("Voice state updated:", JSON.stringify(Array.from(activeVCSessions.entries())));
        console.log("Old State:", oldState.channelId, "New State:", newState.channelId);

        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;
        const guild = newState.guild ?? oldState.guild;
        const userId = newState.id; // same as oldState.id

        if (!guild) {
            return;
        }

        const member = newState.member ?? oldState.member;
        if (!member || member.user.bot) {
            return;
        }

        if (!oldChannelId && newChannelId) {
            const key = getActiveVCSessionKey(guild.id, userId);
            activeVCSessions.set(key, {
                guildId: guild.id,
                userId: userId,
                channelId: newChannelId,
                joinedAt: new Date(),
            });
        } else if (oldChannelId && !newChannelId) {
            const key = getActiveVCSessionKey(guild.id, userId);
            await onLeaveVoiceChannel(guild.id, userId, member.roles.cache.map(role => role.id));
            activeVCSessions.delete(key);
        } else if (oldChannelId && newChannelId) {
            const oldKey = getActiveVCSessionKey(guild.id, userId);
            await onLeaveVoiceChannel(guild.id, userId, member.roles.cache.map(role => role.id));
            activeVCSessions.delete(oldKey);

            const newKey = getActiveVCSessionKey(guild.id, userId);
            activeVCSessions.set(newKey, {
                guildId: guild.id,
                userId: userId,
                channelId: newChannelId,
                joinedAt: new Date(),
            });
        }
    });
}