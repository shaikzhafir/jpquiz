import type { PackManifestEntry, Script } from "@/types/pack";
import type { PackLifetimeStats } from "@/lib/packStats";
import { formatPackStatLine } from "@/lib/packStats";

type Props = {
  script: Script;
  packs: PackManifestEntry[];
  packId: string;
  onPackId: (id: string) => void;
  statsByPackId: Record<string, PackLifetimeStats>;
  disabled?: boolean;
};

function sortByTitle(a: PackManifestEntry, b: PackManifestEntry): number {
  return a.title.localeCompare(b.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function groupPacks(filtered: PackManifestEntry[]) {
  const map = new Map<string, { title: string; packs: PackManifestEntry[] }>();
  const ungrouped: PackManifestEntry[] = [];
  for (const p of filtered) {
    if (p.groupId && p.groupTitle) {
      let g = map.get(p.groupId);
      if (!g) {
        g = { title: p.groupTitle, packs: [] };
        map.set(p.groupId, g);
      }
      g.packs.push(p);
    } else {
      ungrouped.push(p);
    }
  }
  for (const g of map.values()) {
    g.packs.sort(sortByTitle);
  }
  ungrouped.sort(sortByTitle);
  const groups = [...map.entries()]
    .sort(([, a], [, b]) => a.title.localeCompare(b.title))
    .map(([id, g]) => ({ id, ...g }));
  return { ungrouped, groups };
}

export function PackPicker({
  script,
  packs,
  packId,
  onPackId,
  statsByPackId,
  disabled,
}: Props) {
  const filtered = packs.filter((p) => p.script === script);
  const { ungrouped, groups } = groupPacks(filtered);
  const statHint = formatPackStatLine(statsByPackId[packId]);

  return (
    <div className="pack-picker">
      <label className="field">
        <span className="label">Deck</span>
        <select
          value={packId}
          disabled={disabled || filtered.length === 0}
          onChange={(e) => onPackId(e.target.value)}
        >
          {filtered.length === 0 ? (
            <option value="">No decks for this script</option>
          ) : null}
          {ungrouped.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
          {groups.map((g) => (
            <optgroup key={g.id} label={g.title}>
              {g.packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {packId && filtered.length > 0 ? (
        <p className="pack-stat-hint" aria-live="polite">
          {statHint ?? "No lifetime stats for this deck yet."}
        </p>
      ) : null}
    </div>
  );
}
