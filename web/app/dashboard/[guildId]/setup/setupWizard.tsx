"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import { Toggle } from "@/app/components/ui/form";
import { ChannelField, RoleField } from "@/app/components/ui/pickers";
import { Sprite } from "@/app/components/ui/sprite";
import type { SpriteName } from "@/app/sprites";
import type { GuildConfigJson, StarterPack } from "@/app/lib/starterPacks";
import { buildSetup, messagesToLevel, PACES, type Answers, type Pace } from "@/app/lib/setupWizard";

/**
 * Five questions that set a server up, instead of nine settings pages. The
 * answers map to settings in lib/setupWizard.ts; everything stays editable on
 * the normal pages afterwards, and the Overview's health check confirms it.
 */

const STEPS = ["Pace", "Features", "Level-ups", "Level roles", "Starting content"] as const;

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
    pace: "standard",
    features: { shop: true, combat: true, encounters: true, duels: false, quests: true, achievements: true },
    levelUpChannelId: "",
    levelRoles: [],
    packId: packs[0]?.id ?? null,
  });
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  async function finish() {
    const next = buildSetup(config as GuildConfigJson | null, answers, packs);
    if (await save(next)) router.push(`/dashboard/${guildId}?setup=done`);
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading…</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl">Set up your server</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Five quick questions. You can change any of it later; nothing you&apos;ve already made is removed.
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
        {step === 0 && (
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

        {step === 1 && (
          <>
            <h2 className="text-lg">What should havocish do here?</h2>
            <p className="text-sm text-[var(--muted)]">Levels and daily rewards are always on.</p>
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

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
          <>
            <h2 className="text-lg">Start with ready-made content?</h2>
            <p className="text-sm text-[var(--muted)]">A pack fills the shop, enemies and quests so there&apos;s something to do right away.</p>
            <div className="space-y-3">
              {[...packs.map((p) => ({ id: p.id as string | null, name: p.name, description: p.description })),
                { id: null, name: "Start empty", description: "I'll make my own items, enemies and quests." }].map((p) => (
                <button
                  key={p.id ?? "none"}
                  type="button"
                  onClick={() => set({ packId: p.id })}
                  aria-pressed={answers.packId === p.id}
                  className={`block w-full rounded-sm border p-4 text-left transition-colors ${
                    answers.packId === p.id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] hover:border-[var(--border-bright)]"
                  }`}
                >
                  <p className="font-display text-base">{p.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{p.description}</p>
                </button>
              ))}
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
          <button type="button" onClick={finish} disabled={saving} className="btn px-4 py-2 text-sm">
            {saving ? "Setting up…" : "Create my setup"}
          </button>
        )}
      </div>
    </main>
  );
}
