import { axialFromPoint, hexDirections, type MatchSnapshot } from "@terror/contracts";

export function terrainRoute(snapshot: MatchSnapshot, target: { q: number; r: number }, slot = 0) {
  const { width, height, scale, hexSideTokenRatio } = snapshot.arena;
  const player = snapshot.players.find((entry) => entry.slot === slot);
  if (!player) throw new Error("Jogador de teste ausente.");
  const start = axialFromPoint(player.position, width, height, scale, hexSideTokenRatio);
  const cells = new Map(snapshot.exploredTerrainCells.map((cell) => [`${cell.q},${cell.r}`, cell]));
  const queue = [start];
  const parents = new Map<string, { q: number; r: number } | null>([[`${start.q},${start.r}`, null]]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const cell = cells.get(`${current.q},${current.r}`);
    if (!cell) throw new Error("Célula de teste não explorada.");
    for (const [direction, offset] of hexDirections.entries()) {
      const next = { q: current.q + offset.q, r: current.r + offset.r };
      const key = `${next.q},${next.r}`;
      const neighbor = cells.get(key);
      const blocked = (gates: typeof cell.gates, edge: number) => gates.some((gate) =>
        gate.direction === edge && (gate.kind !== "door" || !["open", "broken"].includes(gate.state)));
      if (!neighbor || neighbor.terrainType === "wall" || parents.has(key)
        || blocked(cell.gates, direction) || blocked(neighbor.gates, (direction + 3) % 6)) continue;
      parents.set(key, current);
      queue.push(next);
    }
  }
  if (!parents.has(`${target.q},${target.r}`)) return null;
  const path = [target];
  let parent = parents.get(`${target.q},${target.r}`);
  while (parent) {
    path.unshift(parent);
    parent = parents.get(`${parent.q},${parent.r}`);
  }
  return path.slice(1);
}
