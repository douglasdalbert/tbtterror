import { z } from "zod";

export const BASE_TOKEN_DIAMETER = 64;
export const BASE_CELL_CLEARANCE = 8;
const sqrt3 = Math.sqrt(3);

export interface Point { x: number; y: number }
export interface Axial { q: number; r: number }
export interface TerrainPlacement {
  center: Point;
  cells: (Point & Axial)[];
}

const offsets: Axial[] = [
  { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 },
  { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
];

export function cellDimensions(scale: number) {
  z.number().positive().finite().parse(scale);
  const tokenDiameter = BASE_TOKEN_DIAMETER * scale;
  const clearance = BASE_CELL_CLEARANCE * scale;
  const width = tokenDiameter + 2 * clearance;
  const radius = width / sqrt3;
  return { tokenDiameter, clearance, width, radius, height: 2 * radius };
}

export function hexCorners(center: Point, radius: number): Point[] {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = Math.PI / 6 + corner * Math.PI / 3;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}

export function boardArea(width: number, height: number) {
  z.number().nonnegative().finite().parse(width);
  z.number().nonnegative().finite().parse(height);
  const horizontalInset = Math.min(230, width * 0.16);
  const verticalInset = Math.min(230, height * 0.22);
  return {
    x: horizontalInset,
    y: verticalInset,
    width: Math.max(0, width - horizontalInset * 2),
    height: Math.max(0, height - verticalInset * 2),
  };
}

export function terrainLayout(width: number, height: number, scale: number) {
  z.number().nonnegative().finite().parse(width);
  z.number().nonnegative().finite().parse(height);
  const dimensions = cellDimensions(scale);
  const area = boardArea(width, height);
  const origin = { x: width / 2, y: height / 2 };
  const toPixel = ({ q, r }: Axial): Point => ({
    x: origin.x + dimensions.width * (q + r / 2),
    y: origin.y + dimensions.radius * 1.5 * r,
  });
  const placements: TerrainPlacement[] = [];
  const rLimit = Math.ceil(area.height / (3 * dimensions.radius)) + 2;
  const qLimit = Math.ceil(area.width / (2 * dimensions.width) + rLimit / 2) + 2;
  if (area.width > 0 && area.height > 0) {
    for (let r = -rLimit; r <= rLimit; r++) {
      for (let q = -qLimit; q <= qLimit; q++) {
        // Index-7 axial lattice tiles radius-one modules without shared cells.
        if ((3 * q + r) % 7 !== 0) continue;
        const cells = offsets.map((offset) => {
          const axial = { q: q + offset.q, r: r + offset.r };
          return { ...axial, ...toPixel(axial) };
        });
        const fits = cells.every((cell) => hexCorners(cell, dimensions.radius).every((point) =>
          point.x >= area.x - 1e-7 && point.x <= area.x + area.width + 1e-7
          && point.y >= area.y - 1e-7 && point.y <= area.y + area.height + 1e-7,
        ));
        if (fits) placements.push({ center: toPixel({ q, r }), cells });
      }
    }
  }
  return { ...dimensions, area, placements };
}
