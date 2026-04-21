import type { Pack } from "@/types/pack";

const packCache = new Map<string, Pack>();

export async function loadPack(packId: string): Promise<Pack> {
  const cached = packCache.get(packId);
  if (cached) return cached;
  const res = await fetch(`/data/packs/${packId}.json`);
  if (!res.ok) throw new Error(`Failed to load pack: ${packId}`);
  const data = (await res.json()) as Pack;
  if (data.revision == null) data.revision = 1;
  packCache.set(packId, data);
  return data;
}
