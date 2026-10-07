export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guide {
  id: string;
  orientation: "v" | "h";
  position: number;
  start: number;
  end: number;
}

interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

const GUIDE_EPSILON = 0.5;

function horizontalAnchors(rect: Rect): number[] {
  return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
}

function verticalAnchors(rect: Rect): number[] {
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

export function collectGuides(
  rect: Rect,
  neighbors: Rect[],
  epsilon: number = GUIDE_EPSILON,
): Guide[] {
  const guides: Guide[] = [];
  const seen = new Set<string>();
  const ourXs = horizontalAnchors(rect);
  const ourYs = verticalAnchors(rect);

  for (const neighbor of neighbors) {
    for (const ox of ourXs) {
      for (const nx of horizontalAnchors(neighbor)) {
        if (Math.abs(ox - nx) > epsilon) continue;
        const position = Math.round((ox + nx) / 2);
        const id = `v:${position}`;
        if (seen.has(id)) continue;
        seen.add(id);
        guides.push({
          id,
          orientation: "v",
          position,
          start: Math.min(rect.y, neighbor.y),
          end: Math.max(rect.y + rect.height, neighbor.y + neighbor.height),
        });
      }
    }
    for (const oy of ourYs) {
      for (const ny of verticalAnchors(neighbor)) {
        if (Math.abs(oy - ny) > epsilon) continue;
        const position = Math.round((oy + ny) / 2);
        const id = `h:${position}`;
        if (seen.has(id)) continue;
        seen.add(id);
        guides.push({
          id,
          orientation: "h",
          position,
          start: Math.min(rect.x, neighbor.x),
          end: Math.max(rect.x + rect.width, neighbor.x + neighbor.width),
        });
      }
    }
  }

  return guides;
}

export function snapDragPosition(
  candidate: Rect,
  neighbors: Rect[],
  threshold: number,
): SnapResult {
  if (threshold <= 0 || neighbors.length === 0) {
    return {
      x: candidate.x,
      y: candidate.y,
      guides: [],
    };
  }

  let bestDx: number | null = null;
  let bestGapX = threshold + 1;
  let bestDy: number | null = null;
  let bestGapY = threshold + 1;

  const ourXs = horizontalAnchors(candidate);
  const ourYs = verticalAnchors(candidate);

  for (const neighbor of neighbors) {
    for (const ox of ourXs) {
      for (const nx of horizontalAnchors(neighbor)) {
        const gap = Math.abs(nx - ox);
        if (gap <= threshold && gap < bestGapX) {
          bestGapX = gap;
          bestDx = nx - ox;
        }
      }
    }
    for (const oy of ourYs) {
      for (const ny of verticalAnchors(neighbor)) {
        const gap = Math.abs(ny - oy);
        if (gap <= threshold && gap < bestGapY) {
          bestGapY = gap;
          bestDy = ny - oy;
        }
      }
    }
  }

  const x = candidate.x + (bestDx ?? 0);
  const y = candidate.y + (bestDy ?? 0);
  const snapped: Rect = { ...candidate, x, y };

  return {
    x,
    y,
    guides: collectGuides(snapped, neighbors),
  };
}

export type ResizeSnapTargets = { x?: number[]; y?: number[] };

interface NeighborSource {
  settings?: {
    x: number;
    y: number;
    width: number;
    height: number;
    isLoaded: boolean;
  };
}

export function neighborRects(
  state: Record<string, NeighborSource>,
  excludeId: string,
): Rect[] {
  const rects: Rect[] = [];
  for (const [id, item] of Object.entries(state)) {
    if (id === excludeId) continue;
    const settings = item.settings;
    if (!settings?.isLoaded) continue;
    rects.push({
      x: settings.x,
      y: settings.y,
      width: settings.width,
      height: settings.height,
    });
  }
  return rects;
}

export function resizeSnapTargets(
  start: Rect,
  direction: string,
  neighbors: Rect[],
): ResizeSnapTargets {
  if (neighbors.length === 0) return {};

  const movesLeft = direction.includes("left");
  const movesRight = direction.includes("right");
  const movesTop = direction.includes("top");
  const movesBottom = direction.includes("bottom");
  const startRight = start.x + start.width;
  const startBottom = start.y + start.height;
  const x: number[] = [];
  const y: number[] = [];

  if (movesLeft !== movesRight) {
    for (const neighbor of neighbors) {
      for (const edge of horizontalAnchors(neighbor)) {
        const width = movesLeft ? startRight - edge : edge - start.x;
        if (width > 0) x.push(width);
      }
    }
  }

  if (movesTop !== movesBottom) {
    for (const neighbor of neighbors) {
      for (const edge of verticalAnchors(neighbor)) {
        const height = movesTop ? startBottom - edge : edge - start.y;
        if (height > 0) y.push(height);
      }
    }
  }

  return {
    ...(x.length > 0 ? { x } : {}),
    ...(y.length > 0 ? { y } : {}),
  };
}
