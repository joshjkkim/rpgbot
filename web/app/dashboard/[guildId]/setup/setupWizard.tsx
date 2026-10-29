"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import { Toggle } from "@/app/components/ui/form";
import { ChannelField, RoleField } from "@/app/components/ui/pickers";
import { Sprite } from "@/app/components/ui/sprite";
import type { SpriteName } from "@/app/sprites";
import type { GuildConfigJson, StarterPack } from "@content/packs";
import { buildSetup, messagesToLevel, PACES, type Answers, type Pace } from "@/app/lib/setupWizard";

/**
 * A few questions that set a server up, instead of nine settings pages. The
 * answers map to settings in lib/setupWizard.ts; everything stays editable on
 * the normal pages afterwards, and the Overview's health check confirms it.
 */

/** With havocish leveling, every step; with another leveling bot, no pace or level-ups, and its roles get rewards. */
const OWN_STEPS = ["Leveling", "Features", "Level-ups", "Level roles", "Starting content"] as const;
const OTHER_BOT_STEPS = ["Leveling", "Features", "Role rewards", "Starting content"] as const;
type Step = (typeof OWN_STEPS)[number] | (typeof OTHER_BOT_STEPS)[number];

const FEATURES: Array<{ key: keyof Answers["features"]; label: string; hint: string; sprite: SpriteName; needsCombat?: boolean }> = [
  { key: "shop", label: "Shop & items", hint: "Members spend gold on gear and potions.", sprite: "coin" },
  { key: "combat", label: "Combat", hint: "/fight enemies for XP, gold and loot.", sprite: "swords" },
  { key: "encounters", label: "Random encounters", hint: "Wild enemies sometimes appear while people chat.", sprite: "skull", needsCombat: true },
  { key: "duels", label: "Duels", hint: "Members challenge each other, with optional gold wagers.", sprite: "swords", needsCombat: true },
  { key: "quests", label: "Quests", hint: "Goals like 'send 25 messages' with rewards.", sprite: "scroll" },
  { key: "achievements", label: "Achievements", hint: "Milestones that unlock as people play.", sprite: "trophy" },
];

export default function SetupWizard({ guildId, packs }: { guildId: string; packs: StarterPack[] }) {
  const router = useRouter();
  const { config, loading, saving, error, save } = useGuildConfig(guildId);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    ownLeveling: true,
    pace: "standard",
    features: { shop: true, combat: true, encounters: true, duels: false, quests: true, achievements: true },
    levelUpChannelId: "",
    levelRoles: [],
    roleGold: [],
    packId: packs[0]?.id ?? null,
  });
  // Their own world: written from this description when they finish, then set up like a starter pack.
  const [ownWorld, setOwnWorld] = useState(false);
  const [describe, setDescribe] = useState("");
  const [writing, setWriting] = useState(false);
  const [worldError, setWorldError] = useState<string | null>(null);
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));
  const STEPS: readonly Step[] = answers.ownLeveling ? OWN_STEPS : OTHER_BOT_STEPS;
  const current = STEPS[step];

  async function finish() {
    let chosen = answers;
    let all = packs;
    if (ownWorld) {
      setWriting(true);
      setWorldError(null);
      const res = await fetch(`/api/discord/guilds/${guildId}/ai-packs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: describe }),
      }).catch(() => null);
      const data = await res?.json().catch(() => null);
      setWriting(false);
      if (!data?.pack) {
        setWorldError(data?.message ?? "Your world couldn't be made. Try again.");
        return;
      }
      all = [...packs, data.pack.pack as StarterPack];
      chosen = { ...answers, packId: data.pack.pack.id };
    }
    const next = buildSetup(config as GuildConfigJson | null, chosen, all);
    if (await save(next)) router.push(`/dashboard/${guildId}?setup=done`);
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl">Set up your server</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {STEPS.length} quick questions. You can change any of it later; nothing you&apos;ve already made is removed.
        </p>
        <ol className="mt-4 flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`rounded-sm border px-2 py-1 ${
                i === step ? "border-[var(--accent)] text-[var(--accent)]"
                : i < step ? "border-[var(--border)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {i < step ? "✓ " : `${i + 1}. `}{label}
            </li>
          ))}
        </ol>
      </header>

      <section className="frame space-y-4 p-5">
        {current === "Leveling" && (
          <>
            <h2 className="text-lg">Who handles leveling?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { own: true, name: "havocish", blurb: "Members level up here by chatting, and each chat level makes them a little stronger in the RPG." },
                { own: false, name: "I already have a leveling bot", blurb: "Keep it. havocish runs just the RPG, and you can reward the roles your bot gives at levels." },
              ].map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => set({ ownLeveling: o.own })}
                  aria-pressed={answers.ownLeveling === o.own}
                  className={`rounded-sm border p-4 text-left transition-colors ${
                    answers.ownLeveling === o.own ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--border-bright)]"
                  }`}
                >
                  <p className="font-display text-base">{o.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{o.blurb}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {current === "Leveling" && answers.ownLeveling && (
          <>
            <h2 className="text-lg">How fast should members level up?</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(PACES) as Pace[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ pace: p })}
                  aria-pressed={answers.pace === p}
                  className={`rounded-sm border p-4 text-left transition-colors ${
                    answers.pace === p ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--border-bright)]"
                  }`}
                >
                  <p className="font-display text-base">{PACES[p].label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{PACES[p].blurb}</p>
                  <p className="mt-3 text-sm">Level 10 after about <strong>{messagesToLevel(p, 10).toLocaleString()}</strong> messages</p>
                </button>
              ))}
            </div>
          </>
        )}

        {current === "Features" && (
          <>
            <h2 className="text-lg">What should havocish do here?</h2>
            <p className="text-sm text-[var(--muted)]">{answers.ownLeveling ? "Levels and daily rewards are always on." : "Daily rewards are always on."}</p>
            <div className="space-y-3">
              {FEATURES.filter((f) => !f.needsCombat || answers.features.combat).map((f) => (
                <div key={f.key} className={`flex items-start gap-3 ${f.needsCombat ? "pl-8" : ""}`}>
                  <Sprite name={f.sprite} size={24} />
                  <Toggle
                    label={f.label}
                    hint={f.hint}
                    checked={answers.features[f.key]}
                    onChange={(v) => set({ features: { ...answers.features, [f.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {current === "Level-ups" && (
          <>
            <h2 className="text-lg">Where should level-ups be announced?</h2>
            <p className="text-sm text-[var(--muted)]">havocish posts a level-up banner there. Pick a busy channel, or skip.</p>
            <ChannelField
              label="Level-up channel"
              value={answers.levelUpChannelId}
              onChange={(v) => set({ levelUpChannelId: v })}
              emptyLabel="Don't announce"
            />
          </>
        )}

        {current === "Level roles" && (
          <>
            <h2 className="text-lg">Give roles at certain levels?</h2>
            <p className="text-sm text-[var(--muted)]">
              For example level 5 → @Regular, level 20 → @Veteran. Optional. havocish needs Manage Roles and to sit above these roles.
            </p>
            <div className="space-y-3">
              {answers.levelRoles.map((row, i) => (
                <div key={i} className="flex items-end gap-3">
                  <label className="w-28 space-y-1.5 text-sm">
                    <span className="block font-medium">Level</span>
                    <input
                      type="number" min={1} value={row.level}
                      onChange={(e) => set({ levelRoles: answers.levelRoles.map((r, j) => (j === i ? { ...r, level: Number(e.target.value) } : r)) })}
                      className="w-full rounded-sm border px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex-1">
                    <RoleField
                      label="Role"
                      value={row.roleId}
                      onChange={(v) => set({ levelRoles: answers.levelRoles.map((r, j) => (j === i ? { ...r, roleId: v } : r)) })}
                      emptyLabel="Pick a role"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => set({ levelRoles: answers.levelRoles.filter((_, j) => j !== i) })}
                    className="pb-2 text-xs text-[var(--muted)] hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set({ levelRoles: [...answers.levelRoles, { level: answers.levelRoles.length ? 10 * (answers.levelRoles.length + 1) : 5, roleId: "" }] })}
                className="btn btn-stone px-3 py-1.5 text-sm"
              >
                + Add a level role
              </button>
            </div>
          </>
        )}

        {current === "Role rewards" && (
          <>
            <h2 className="text-lg">Reward your leveling bot&apos;s roles?</h2>
            <p className="text-sm text-[var(--muted)]">
              When your other bot gives a role at a level, havocish can pay gold for it, once per member. Optional; items and
              Combat XP can be added later on the Leveling page.
            </p>
            <div className="space-y-3">
              {answers.roleGold.map((row, i) => (
                <div key={i} className="flex items-end gap-3">
                  <div className="flex-1">
                    <RoleField
                      label="Role"
                      value={row.roleId}
                      onChange={(v) => set({ roleGold: answers.roleGold.map((r, j) => (j === i ? { ...r, roleId: v } : r)) })}
                      emptyLabel="Pick a role"
                    />
                  </div>
                  <label className="w-28 space-y-1.5 text-sm">
                    <span className="block font-medium">Gold</span>
                    <input
                      type="number" min={1} value={row.gold}
                      onChange={(e) => set({ roleGold: answers.roleGold.map((r, j) => (j === i ? { ...r, gold: Number(e.target.value) } : r)) })}
                      className="w-full rounded-sm border px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => set({ roleGold: answers.roleGold.filter((_, j) => j !== i) })}
                    className="pb-2 text-xs text-[var(--muted)] hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set({ roleGold: [...answers.roleGold, { roleId: "", gold: 100 * (answers.roleGold.length + 1) }] })}
                className="btn btn-stone px-3 py-1.5 text-sm"
              >
                + Add a role reward
              </button>
            </div>
          </>
        )}

        {current === "Starting content" && (
          <>
            <h2 className="text-lg">Start with ready-made content?</h2>
            <p className="text-sm text-[var(--muted)]">A pack fills the shop, enemies and quests so there&apos;s something to do right away.</p>
            <div className="space-y-3">
              {[...packs.map((p) => ({ id: p.id as string | null, own: false, name: p.name, description: p.description })),
                { id: null, own: true, name: "Describe my own world", description: "Tell the AI about your world after setup, and it writes enemies, places, gear, quests, gathering and crafting for it." },
                { id: null, own: false, name: "Start empty", description: "I'll make my own items, enemies and quests." }].map((p) => {
                const picked = answers.packId === p.id && ownWorld === p.own;
                return (
                <button
                  key={p.id ?? (p.own ? "own" : "none")}
                  type="button"
                  onClick={() => { set({ packId: p.id }); setOwnWorld(p.own); }}
                  aria-pressed={picked}
                  className={`block w-full rounded-sm border p-4 text-left transition-colors ${
                    picked ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--border-bright)]"
                  }`}
                >
                  <p className="font-display text-base">{p.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{p.description}</p>
                </button>
                );
              })}
              {ownWorld && (
                <label className="block">
                  <span className="text-sm">What&apos;s your world like?</span>
                  <textarea
                    value={describe}
                    onChange={(e) => setDescribe(e.target.value)}
                    maxLength={1500}
                    rows={4}
                    placeholder="A drowned city under a lighthouse that never goes out. Players are salvage divers…"
                    className="mt-1 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  />
                  <span className="text-xs text-[var(--muted)]">It&apos;s written when you finish setup, in about a minute.</span>
                </label>
              )}
              {worldError && <p className="text-sm text-red-300">{worldError}</p>}
            </div>
          </>
        )}
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="btn btn-stone px-4 py-2 text-sm"
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="btn px-4 py-2 text-sm">
            Next
          </button>
        ) : (
          <button type="button" onClick={finish} disabled={saving || writing || (ownWorld && describe.trim().length < 10)} className="btn px-4 py-2 text-sm">
            {writing ? "Writing your world…" : saving ? "Setting up…" : "Create my setup"}
          </button>
        )}
      </div>
    </main>
  );
}
