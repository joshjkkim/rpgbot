import CharactersPageClient from "./charactersPageClient";

export default async function CharactersPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <CharactersPageClient guildId={guildId} />;
}
