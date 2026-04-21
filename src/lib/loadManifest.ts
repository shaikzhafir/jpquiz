import type { PackManifest, PackManifestEntry } from "@/types/pack";

async function loadOverlayPacks(url: string): Promise<PackManifestEntry[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as PackManifest;
    return data.packs ?? [];
  } catch {
    return [];
  }
}

export async function loadManifest(): Promise<PackManifest> {
  const [baseRes, anki] = await Promise.all([
    fetch("/data/packs/manifest.json"),
    loadOverlayPacks("/data/packs/anki.manifest.json"),
  ]);
  if (!baseRes.ok) throw new Error("Failed to load pack manifest");
  const base = (await baseRes.json()) as PackManifest;

  return {
    version: base.version,
    packs: [...base.packs, ...anki],
  };
}
