import { useEffect, useRef } from "react";
import Phaser from "phaser";
import {
  BASE_MOVEMENT_CELLS_PER_TURN, DEFAULT_TURN_DURATION_MS, boardArea, cellDimensions, hexCorners,
  DEFAULT_HEX_SIDE_TOKEN_RATIO,
  axialFromPoint, hexDirections,
  movementMultiplier, terrainLayout, tokenHitCircle,
  initialTokenPosition, PLAYER_COLORS,
  type PublicCatalog, type MatchSnapshot, type MatchCommand, type PlayerColor,
} from "@terror/contracts";
import { tokenTextOutline } from "./TokenVisual.js";

const isProduction = import.meta.env.APP_NODE_ENV === "production";

export interface LayoutSummary {
  capacity: number;
  cells: number;
  cellWidth: number;
  tokenDiameter: number;
}

export interface PreviewPlayer {
  slot: number;
  name: string;
  color: PlayerColor;
  attributes: PublicCatalog["characters"][number]["attributes"];
}

interface Position { x: number; y: number }
export interface BoardInteraction {
  onPressed: (slot: number, pressed: boolean) => void;
  onCommand: (command: MatchCommand) => void;
}

class TerrainPreviewScene extends Phaser.Scene {
  #graphics: Phaser.GameObjects.Graphics | undefined;
  #fogGraphics: Phaser.GameObjects.Graphics | undefined;
  #tokenGraphics: Phaser.GameObjects.Graphics | undefined;
  #terrainLabel: Phaser.GameObjects.Text | undefined;
  #scale = 1;
  #players: PreviewPlayer[] = [];
  #layout: ReturnType<typeof terrainLayout> | undefined;
  #layoutWidth = -1;
  #layoutHeight = -1;
  #layoutScale = -1;
  #layoutHexSideTokenRatio = -1;
  #positions = new Map<number, Position>();
  #zones = new Map<number, Phaser.GameObjects.Zone>();
  #zoneDiameters = new Map<number, number>();
  #labels = new Map<number, Phaser.GameObjects.Text>();
  #dragging = new Map<number, { slot: number; offsetX: number; offsetY: number }>();
  #snapshot: MatchSnapshot | undefined;
  #interaction: BoardInteraction | undefined;
  #lastMove = new Map<number, number>();
  #lastInput = new Map<number, number>();

  create() {
    this.#graphics = this.add.graphics().setDepth(-2);
    this.#fogGraphics = this.add.graphics();
    this.#tokenGraphics = this.add.graphics();
    this.#scale = this.registry.get("previewScale");
    this.#players = this.registry.get("previewPlayers") ?? [];
    this.#snapshot = this.registry.get("matchSnapshot");
    this.#interaction = this.registry.get("interaction");
    this.scale.on("resize", this.drawBoard, this);
    this.game.events.on("preview:scale", this.changeScale, this);
    this.game.events.on("preview:players", this.changePlayers, this);
    this.game.events.on("match:state", this.changeMatch, this);
    this.input.on("pointermove", this.moveToken, this);
    this.input.on("pointerup", this.finishDrag, this);
    this.input.on("pointerupoutside", this.finishDrag, this);
    window.addEventListener("blur", this.cancelDrags);
    window.addEventListener("pointercancel", this.cancelNativePointer);
    window.addEventListener("touchcancel", this.cancelNativeTouch);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.drawBoard, this);
      this.game.events.off("preview:scale", this.changeScale, this);
      this.game.events.off("preview:players", this.changePlayers, this);
      this.game.events.off("match:state", this.changeMatch, this);
      this.input.off("pointermove", this.moveToken, this);
      this.input.off("pointerup", this.finishDrag, this);
      this.input.off("pointerupoutside", this.finishDrag, this);
      window.removeEventListener("blur", this.cancelDrags);
      window.removeEventListener("pointercancel", this.cancelNativePointer);
      window.removeEventListener("touchcancel", this.cancelNativeTouch);
    });
    if (this.#snapshot) this.changeMatch(this.#snapshot);
    else this.drawBoard();
  }

  changeScale(scale: number) {
    this.cancelDrags();
    this.#scale = scale;
    this.drawBoard();
  }

  changePlayers(players: PreviewPlayer[]) {
    this.#players = players;
    this.drawBoard();
  }

  changeMatch(snapshot: MatchSnapshot) {
    const previous = this.#snapshot;
    const geometryChanged = !this.#layout || !this.#snapshot
      || this.#snapshot.arena.width !== snapshot.arena.width
      || this.#snapshot.arena.height !== snapshot.arena.height
      || this.#snapshot.arena.hexSideTokenRatio !== snapshot.arena.hexSideTokenRatio
      || this.#snapshot.arena.scale !== snapshot.arena.scale;
    const terrainChanged = !this.#snapshot
      || this.#snapshot.exploredTerrainCells.length !== snapshot.exploredTerrainCells.length
      || this.#snapshot.exploredTerrainCells.some((cell, index) => {
        const next = snapshot.exploredTerrainCells[index];
        return !next || cell.q !== next.q || cell.r !== next.r || cell.terrainType !== next.terrainType
          || JSON.stringify(cell.objectSlots) !== JSON.stringify(next.objectSlots)
          || JSON.stringify(cell.gates) !== JSON.stringify(next.gates);
      });
    const fogChanged = !this.#snapshot
      || this.#snapshot.visibleTerrainCellKeys.join(";") !== snapshot.visibleTerrainCellKeys.join(";")
      || this.#snapshot.phase !== snapshot.phase;
    if (this.#snapshot && (this.#snapshot.arena.scale !== snapshot.arena.scale
      || this.#snapshot.phase !== snapshot.phase || geometryChanged)) this.cancelDrags();
    this.#snapshot = snapshot;
    this.#scale = snapshot.arena.scale;
    this.#players = snapshot.players;
    for (const player of snapshot.players) {
      this.#positions.set(player.slot, player.position);
    }
    this.drawBoard(geometryChanged || terrainChanged);
    if (fogChanged || geometryChanged || terrainChanged) this.drawFog();
    if (previous?.id === snapshot.id && !geometryChanged) this.animateDoorChanges(previous, snapshot);
  }

  private animateDoorChanges(previous: MatchSnapshot, snapshot: MatchSnapshot) {
    const visible = new Set(snapshot.visibleTerrainCellKeys);
    const before = new Map(previous.exploredTerrainCells.flatMap((cell) =>
      cell.gates.flatMap((gate) => gate.kind === "door" ? [[`${cell.q},${cell.r},${gate.direction}`, gate.state] as const] : []),
    ));
    const layout = this.currentLayout();
    for (const cell of snapshot.exploredTerrainCells) {
      if (!visible.has(`${cell.q},${cell.r}`)) continue;
      for (const gate of cell.gates) {
        if (gate.kind === "door") {
          const state = before.get(`${cell.q},${cell.r},${gate.direction}`);
          if (!state || state === gate.state) continue;
        } else if (gate.kind === "window") {
          const offset = hexDirections[gate.direction]!;
          const crossed = snapshot.players.some((player) => {
            const old = previous.players.find((entry) => entry.slot === player.slot);
            if (!old || (old.position.x === player.position.x && old.position.y === player.position.y)) return false;
            const axial = (position: Position) => axialFromPoint(position, snapshot.arena.width,
              snapshot.arena.height, snapshot.arena.scale, snapshot.arena.hexSideTokenRatio);
            const from = axial(old.position);
            const to = axial(player.position);
            return (from.q === cell.q && from.r === cell.r && to.q === cell.q + offset.q && to.r === cell.r + offset.r)
              || (to.q === cell.q && to.r === cell.r && from.q === cell.q + offset.q && from.r === cell.r + offset.r);
          });
          if (!crossed) continue;
        } else continue;
        const center = {
          x: snapshot.arena.width / 2 + layout.width * (cell.q + cell.r / 2),
          y: snapshot.arena.height / 2 + layout.radius * 1.5 * cell.r,
        };
        const corners = hexCorners(center, layout.radius);
        const first = corners[(gate.direction + 5) % 6]!;
        const second = corners[gate.direction]!;
        const pulse = this.add.graphics().setDepth(-0.5);
        this.tweens.addCounter({
          from: 0, to: 1, duration: 800,
          onUpdate: (tween) => {
            const progress = tween.getValue() ?? 0;
            pulse.clear().lineStyle(4 * this.#scale, 0x75d9f4, 1 - progress);
            pulse.strokeCircle((first.x + second.x) / 2, (first.y + second.y) / 2,
              layout.tokenDiameter * (0.25 + progress));
          },
          onComplete: () => pulse.destroy(),
        });
      }
    }
  }

  moveToken(pointer: Phaser.Input.Pointer) {
    const drag = this.#dragging.get(pointer.id);
    if (!drag) return;
    const layout = this.currentLayout();
    const diameter = layout.tokenDiameter;
    const current = this.#positions.get(drag.slot);
    if (!current) return;
    const requested = this.constrainPosition({
      x: pointer.worldX + drag.offsetX,
      y: pointer.worldY + drag.offsetY,
    }, layout.area, diameter);
    const time = performance.now();
    const elapsed = Math.max(0, time - (this.#lastInput.get(drag.slot) ?? time));
    this.#lastInput.set(drag.slot, time);
    const dexterity = this.#players.find(({ slot }) => slot === drag.slot)?.attributes.dexterity ?? 1;
    const deltaX = requested.x - current.x;
    const deltaY = requested.y - current.y;
    const distance = Math.hypot(deltaX, deltaY);
    const baseMovementPerTurn = this.#snapshot?.baseMovementCellsPerTurn
      ?? BASE_MOVEMENT_CELLS_PER_TURN;
    const turnDurationMs = this.#snapshot?.turnDurationMs ?? DEFAULT_TURN_DURATION_MS;
    const maxDistance = layout.width * baseMovementPerTurn * movementMultiplier(dexterity)
      * elapsed / turnDurationMs;
    const fraction = this.#snapshot?.phase === "running" && distance > maxDistance && distance > 0
      ? maxDistance / distance
      : 1;
    this.#positions.set(drag.slot, {
      x: current.x + deltaX * fraction,
      y: current.y + deltaY * fraction,
    });
    if (time - (this.#lastMove.get(drag.slot) ?? 0) >= 50) {
      this.#lastMove.set(drag.slot, time);
      const position = this.#positions.get(drag.slot);
      if (position) this.#interaction?.onCommand({ type: "move", slot: drag.slot, position });
    }
    this.drawBoard(false);
  }

  finishDrag(pointer: Phaser.Input.Pointer) {
    const drag = this.#dragging.get(pointer.id);
    if (!drag) return;
    const position = this.#positions.get(drag.slot);
    if (position) this.#interaction?.onCommand({ type: "move", slot: drag.slot, position });
    this.#dragging.delete(pointer.id);
    this.#lastInput.delete(drag.slot);
    this.#interaction?.onPressed(drag.slot, false);
    this.#interaction?.onCommand({ type: "release", slot: drag.slot });
  }

  cancelDrags = () => {
    for (const drag of this.#dragging.values()) {
      this.#interaction?.onPressed(drag.slot, false);
      this.#interaction?.onCommand({ type: "release", slot: drag.slot });
      this.#lastInput.delete(drag.slot);
    }
    this.#dragging.clear();
  };

  private cancelNativePointer = (event: PointerEvent) => {
    const pointer = this.input.manager.pointers.find(({ pointerId }) => pointerId === event.pointerId);
    if (pointer) this.finishDrag(pointer);
  };

  private cancelNativeTouch = (event: TouchEvent) => {
    for (const touch of Array.from(event.changedTouches)) {
      const pointer = this.input.manager.pointers.find(
        (candidate) => candidate.active && candidate.identifier === touch.identifier,
      );
      if (pointer) this.finishDrag(pointer);
    }
  };

  drawBoard(updateSummary = true) {
    const graphics = this.#graphics;
    const tokenGraphics = this.#tokenGraphics;
    if (!graphics || !tokenGraphics) return;
    const layout = this.currentLayout();
    if (updateSummary) {
      graphics.clear();
      this.#terrainLabel?.destroy();
      this.#terrainLabel = undefined;
      graphics.lineStyle(1, 0x718198, 0.3);
      graphics.strokeRect(layout.area.x, layout.area.y, layout.area.width, layout.area.height);
      if (this.#snapshot) {
        const colors: Record<string, number> = {
          path: 0x293345,
          clearing: 0x3c5044,
          room: 0x51483c,
          wall: 0x343434,
          "abandoned-house": 0x49443e,
        };
        for (const cell of this.#snapshot.exploredTerrainCells) {
          const center = {
            x: this.#snapshot.arena.width / 2 + layout.width * (cell.q + cell.r / 2),
            y: this.#snapshot.arena.height / 2 + layout.radius * 1.5 * cell.r,
          };
          graphics.fillStyle(colors[cell.terrainType] ?? 0x293345, 0.85);
          graphics.lineStyle(Math.max(1, this.#scale), 0x64758b, 0.65);
          graphics.fillPoints(hexCorners(center, layout.radius), true);
          graphics.strokePoints(hexCorners(center, layout.radius), true);
          const corners = hexCorners(center, layout.radius);
          for (const gate of cell.gates) {
            const edge = (gate.direction + 5) % 6;
            const from = corners[edge];
            const to = corners[(edge + 1) % 6];
            if (!from || !to) continue;
            const edgeLength = Math.hypot(to.x - from.x, to.y - from.y);
            const unitX = (to.x - from.x) / edgeLength;
            const unitY = (to.y - from.y) / edgeLength;
            const lineWidth = Math.max(1, this.#scale * (gate.kind === "wall" ? 5 : 3));
            const color = gate.kind === "wall" ? 0x17191b
              : gate.kind === "window" ? 0x91aab8 : 0x8b6842;
            graphics.lineStyle(lineWidth, color, gate.kind === "window" ? 0.5 : 0.95);
            if (gate.kind === "door" && gate.state === "broken") continue;
            if (gate.kind === "door" && gate.state === "open") {
              // The open leaf must not narrow the full-side passage.
              graphics.lineBetween(
                from.x, from.y,
                from.x - unitY * edgeLength,
                from.y + unitX * edgeLength,
              );
            } else if (gate.kind === "window") {
              const inset = edgeLength * 0.2;
              graphics.lineBetween(
                from.x + unitX * inset,
                from.y + unitY * inset,
                to.x - unitX * inset,
                to.y - unitY * inset,
              );
            } else {
              graphics.lineBetween(from.x, from.y, to.x, to.y);
              if (gate.kind === "door" && gate.state === "locked") {
                graphics.lineStyle(Math.max(1, this.#scale * 2), 0xf0c36a, 1);
                graphics.strokeCircle((from.x + to.x) / 2, (from.y + to.y) / 2, this.#scale * 4);
              }
            }
          }
          if (cell.objectSlots.includes("lost-item")) {
            const markerRadius = Math.max(3, 5 * this.#scale);
            graphics.fillStyle(0xd0b27a, 0.9);
            graphics.fillCircle(center.x, center.y, markerRadius);
            graphics.lineStyle(Math.max(1, this.#scale), 0x2a2520, 0.9);
            graphics.strokeCircle(center.x, center.y, markerRadius);
          }
          if (!isProduction && cell.terrainType === "abandoned-house" && !this.#terrainLabel) {
            this.#terrainLabel = this.add.text(center.x, center.y - layout.radius * 0.4, "Casa\nabandonada", {
              fontFamily: "sans-serif", fontSize: `${12 * this.#scale}px`, color: "#e5dfd4", align: "center",
            }).setOrigin(0.5).setDepth(-1);
          }
        }
      } else {
        layout.placements.forEach((terrain, index) => {
          graphics.fillStyle(index % 2 ? 0x293345 : 0x202a38, 0.75);
          graphics.lineStyle(Math.max(1, this.#scale), 0x64758b, 0.65);
          for (const cell of terrain.cells) {
            graphics.fillPoints(hexCorners(cell, layout.radius), true);
            graphics.strokePoints(hexCorners(cell, layout.radius), true);
          }
        });
      }
    }
    tokenGraphics.clear();

    const activeSlots = new Set(this.#players.map(({ slot }) => slot));
    for (const [slot, zone] of this.#zones) {
      if (activeSlots.has(slot)) continue;
      zone.destroy();
      this.#zones.delete(slot);
      this.#zoneDiameters.delete(slot);
      this.#positions.delete(slot);
      this.#labels.get(slot)?.destroy();
      this.#labels.delete(slot);
    }
    for (const [pointerId, drag] of this.#dragging) {
      if (!activeSlots.has(drag.slot)) {
        this.#dragging.delete(pointerId);
        this.#interaction?.onPressed(drag.slot, false);
      }
    }

    for (const player of this.#players) {
      const { slot, name } = player;
      const color = PLAYER_COLORS.find(({ id }) => id === player.color);
      const diameter = layout.tokenDiameter;
      const position = this.#positions.get(slot);
      if (!position) {
        this.#positions.set(slot, this.startingPosition(slot, layout.area, diameter));
      } else {
        this.#positions.set(slot, this.constrainPosition(position, layout.area, diameter));
      }
      const center = this.#positions.get(slot);
      if (!center) continue;

      if (!color) throw new Error(`Cor de token desconhecida: ${player.color}`);
      const borderWidth = Math.max(1, diameter * 0.025);
      const radius = (diameter - borderWidth) / 2;
      tokenGraphics.fillStyle(Number.parseInt(color.hex.slice(1), 16), 0.95);
      tokenGraphics.fillCircle(center.x, center.y, radius);
      tokenGraphics.lineStyle(borderWidth, Number.parseInt(color.text.slice(1), 16), 0.9);
      tokenGraphics.strokeCircle(center.x, center.y, radius);
      this.updateLabels(slot, name, center, diameter, color.text, tokenTextOutline(color.text));
      this.updateZone(slot, center, diameter);
    }

    if (updateSummary) {
      this.game.events.emit("preview:layout", {
        capacity: layout.placements.length,
        cells: this.#snapshot?.exploredTerrainCells.length ?? 0,
        cellWidth: layout.width,
        tokenDiameter: layout.tokenDiameter,
      } satisfies LayoutSummary);
    }
  }

  private drawFog() {
    const graphics = this.#fogGraphics;
    const snapshot = this.#snapshot;
    if (!graphics || !snapshot) return;
    graphics.clear();
    if (!["chapter", "running", "paused"].includes(snapshot.phase) || !snapshot.exploredTerrainCells.length) return;

    const layout = this.currentLayout();
    const dimensions = cellDimensions(snapshot.arena.scale, snapshot.arena.hexSideTokenRatio);
    const explored = new Set(snapshot.exploredTerrainCells.map(({ q, r }) => `${q},${r}`));
    const visible = new Set(snapshot.visibleTerrainCellKeys);
    const minR = Math.floor(-snapshot.arena.height / (dimensions.radius * 1.5)) - 1;
    const maxR = Math.ceil(snapshot.arena.height / (dimensions.radius * 1.5)) + 1;
    const minQ = Math.floor(-snapshot.arena.width / dimensions.width) - 1;
    const maxQ = Math.ceil(snapshot.arena.width / dimensions.width) + 1;
    for (let r = minR; r <= maxR; r++) {
      for (let q = minQ; q <= maxQ; q++) {
        const center = {
          x: snapshot.arena.width / 2 + layout.width * (q + r / 2),
          y: snapshot.arena.height / 2 + layout.radius * 1.5 * r,
        };
        if (center.x < layout.area.x - layout.radius || center.x > layout.area.x + layout.area.width + layout.radius
          || center.y < layout.area.y - layout.radius || center.y > layout.area.y + layout.area.height + layout.radius) continue;
        const key = `${q},${r}`;
        if (visible.has(key)) continue;
        graphics.fillStyle(0x080b10, explored.has(key) ? 0.62 : 0.96);
        graphics.fillPoints(hexCorners(center, layout.radius), true);
      }
    }
  }

  private currentLayout() {
    const width = this.#snapshot?.arena.width ?? this.scale.width;
    const height = this.#snapshot?.arena.height ?? this.scale.height;
    const hexSideTokenRatio = this.#snapshot?.arena.hexSideTokenRatio ?? DEFAULT_HEX_SIDE_TOKEN_RATIO;
    const sourceArea = boardArea(width, height, this.#scale);
    const targetArea = boardArea(this.scale.width, this.scale.height, this.#scale);
    const zoom = Math.min(targetArea.width / sourceArea.width, targetArea.height / sourceArea.height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    if (!this.#layout || width !== this.#layoutWidth || height !== this.#layoutHeight
      || this.#scale !== this.#layoutScale || hexSideTokenRatio !== this.#layoutHexSideTokenRatio) {
      this.#layout = terrainLayout(width, height, this.#scale, hexSideTokenRatio);
      this.#layoutWidth = width;
      this.#layoutHeight = height;
      this.#layoutScale = this.#scale;
      this.#layoutHexSideTokenRatio = hexSideTokenRatio;
    }
    return this.#layout;
  }

  private startingPosition(slot: number, area: Position & { width: number; height: number }, diameter: number) {
    return this.constrainPosition(initialTokenPosition(slot, area, diameter), area, diameter);
  }

  private constrainPosition(position: Position, area: Position & { width: number; height: number }, diameter: number) {
    const minimumX = Math.min(area.x + diameter / 2, area.x + area.width / 2);
    const maximumX = Math.max(minimumX, area.x + area.width - diameter / 2);
    const minimumY = Math.min(area.y + diameter / 2, area.y + area.height / 2);
    const maximumY = Math.max(minimumY, area.y + area.height - diameter / 2);
    return {
      x: Phaser.Math.Clamp(position.x, minimumX, maximumX),
      y: Phaser.Math.Clamp(position.y, minimumY, maximumY),
    };
  }

  private updateLabels(slot: number, name: string, center: Position, diameter: number, textColor: string, outline: string) {
    let label = this.#labels.get(slot);
    if (!label) {
      label = this.add.text(0, 0, name, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
          color: textColor,
          fontStyle: "bold",
        }).setOrigin(0.5);
      this.#labels.set(slot, label);
    }
    label.setText(name);
    label.setPosition(center.x, center.y);
    label.setFontSize(Math.max(6, diameter * 0.3));
    label.setColor(textColor);
    label.setStroke(outline, Math.max(1, diameter * 0.05));
  }

  private updateZone(slot: number, center: Position, diameter: number) {
    let zone = this.#zones.get(slot);
    if (!zone) {
      zone = this.add.zone(center.x, center.y, diameter, diameter);
      zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.#snapshot?.controlSlots.includes(slot)
          || !["lobby", "countdown", "running"].includes(this.#snapshot.phase)
          || this.#snapshot.players.find((p) => p.slot === slot)?.pressed
          || this.#snapshot.activeDoorActions.some((action) => action.slot === slot)
          || [...this.#dragging.values()].some((d) => d.slot === slot)) return;
        const position = this.#positions.get(slot);
        if (!position) return;
        this.#dragging.set(pointer.id, {
          slot,
          offsetX: position.x - pointer.worldX,
          offsetY: position.y - pointer.worldY,
        });
        this.#lastInput.set(slot, performance.now());
        this.#interaction?.onPressed(slot, true);
        this.#interaction?.onCommand({ type: "press", slot });
      });
      this.#zones.set(slot, zone);
      this.#zoneDiameters.set(slot, diameter);
      const circle = tokenHitCircle(diameter);
      zone.setInteractive(
        new Phaser.Geom.Circle(circle.x, circle.y, circle.radius),
        Phaser.Geom.Circle.Contains,
      );
    } else if (this.#zoneDiameters.get(slot) !== diameter) {
      zone.setSize(diameter, diameter);
      const circle = tokenHitCircle(diameter);
      const hitArea: unknown = zone.input?.hitArea;
      if (hitArea instanceof Phaser.Geom.Circle) hitArea.setTo(circle.x, circle.y, circle.radius);
      this.#zoneDiameters.set(slot, diameter);
    }
    zone.setPosition(center.x, center.y);
  }
}

export function Board({ scale, players, snapshot, interaction, onLayout }: {
  scale: number;
  players: PreviewPlayer[];
  snapshot: MatchSnapshot | undefined;
  interaction: BoardInteraction;
  onLayout: (summary: LayoutSummary) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Phaser.Game | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      transparent: true,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      input: { activePointers: 10 },
      scene: TerrainPreviewScene,
      callbacks: {
        preBoot: (bootingGame) => {
          bootingGame.registry.set("previewScale", 1);
          bootingGame.registry.set("previewPlayers", []);
          bootingGame.registry.set("matchSnapshot", snapshot);
          bootingGame.registry.set("interaction", interaction);
          bootingGame.events.on("preview:layout", onLayout);
        },
      },
    });
    instance.current = game;
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (game.isBooted && width > 0 && height > 0
        && (game.scale.width !== width || game.scale.height !== height)) {
        game.scale.setParentSize(width, height);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    game.events.once(Phaser.Core.Events.READY, resize);
    return () => {
      observer.disconnect();
      game.events.off(Phaser.Core.Events.READY, resize);
      game.events.off("preview:layout", onLayout);
      game.destroy(true);
      instance.current = null;
    };
  }, [onLayout]);
  useEffect(() => {
    if (!snapshot) {
      instance.current?.registry.set("previewScale", scale);
      instance.current?.events.emit("preview:scale", scale);
    }
  }, [scale]);
  useEffect(() => {
    if (!snapshot) {
      instance.current?.registry.set("previewPlayers", players);
      instance.current?.events.emit("preview:players", players);
    }
  }, [players]);
  useEffect(() => {
    if (snapshot) {
      instance.current?.registry.set("matchSnapshot", snapshot);
      instance.current?.events.emit("match:state", snapshot);
    }
  }, [snapshot]);
  return <div className="board" ref={host} aria-label="Tabuleiro multitoque com oito setores e prévia de terrenos" />;
}
