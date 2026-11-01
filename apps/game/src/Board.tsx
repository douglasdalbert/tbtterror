import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { boardArea, hexCorners, terrainLayout, tokenHitCircle, initialTokenPosition, type Catalog, type MatchSnapshot, type MatchCommand } from "@terror/contracts";

export interface LayoutSummary {
  terrains: number;
  cells: number;
  cellWidth: number;
  tokenDiameter: number;
}

export interface PreviewPlayer {
  slot: number;
  name: string;
  attributes: Catalog["characters"][number]["attributes"];
}

interface Position { x: number; y: number }
export interface BoardInteraction {
  onPressed: (slot: number, pressed: boolean) => void;
  onCommand: (command: MatchCommand) => void;
}

class TerrainPreviewScene extends Phaser.Scene {
  #graphics: Phaser.GameObjects.Graphics | undefined;
  #tokenGraphics: Phaser.GameObjects.Graphics | undefined;
  #scale = 1;
  #players: PreviewPlayer[] = [];
  #layout: ReturnType<typeof terrainLayout> | undefined;
  #layoutWidth = -1;
  #layoutHeight = -1;
  #layoutScale = -1;
  #positions = new Map<number, Position>();
  #zones = new Map<number, Phaser.GameObjects.Zone>();
  #zoneDiameters = new Map<number, number>();
  #labels = new Map<number, Phaser.GameObjects.Text[]>();
  #dragging = new Map<number, { slot: number; offsetX: number; offsetY: number }>();
  #snapshot: MatchSnapshot | undefined;
  #interaction: BoardInteraction | undefined;
  #lastMove = new Map<number, number>();

  create() {
    this.#graphics = this.add.graphics();
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
    const geometryChanged = !this.#layout || !this.#snapshot
      || this.#snapshot.arena.width !== snapshot.arena.width
      || this.#snapshot.arena.height !== snapshot.arena.height
      || this.#snapshot.arena.scale !== snapshot.arena.scale;
    if (this.#snapshot && (this.#snapshot.arena.scale !== snapshot.arena.scale
      || this.#snapshot.phase !== snapshot.phase || geometryChanged)) this.cancelDrags();
    this.#snapshot = snapshot;
    this.#scale = snapshot.arena.scale;
    this.#players = snapshot.players;
    const dragging = new Set([...this.#dragging.values()].map((d) => d.slot));
    for (const player of snapshot.players) {
      if (!dragging.has(player.slot)) this.#positions.set(player.slot, player.position);
    }
    this.drawBoard(geometryChanged);
  }

  moveToken(pointer: Phaser.Input.Pointer) {
    const drag = this.#dragging.get(pointer.id);
    if (!drag) return;
    const layout = this.currentLayout();
    const diameter = layout.tokenDiameter;
    this.#positions.set(drag.slot, this.constrainPosition({
      x: pointer.worldX + drag.offsetX,
      y: pointer.worldY + drag.offsetY,
    }, layout.area, diameter));
    const time = performance.now();
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
    this.#interaction?.onPressed(drag.slot, false);
    this.#interaction?.onCommand({ type: "release", slot: drag.slot });
  }

  cancelDrags = () => {
    for (const drag of this.#dragging.values()) {
      this.#interaction?.onPressed(drag.slot, false);
      this.#interaction?.onCommand({ type: "release", slot: drag.slot });
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
      graphics.lineStyle(1, 0x718198, 0.3);
      graphics.strokeRect(layout.area.x, layout.area.y, layout.area.width, layout.area.height);
      layout.placements.forEach((terrain, index) => {
        graphics.fillStyle(index % 2 ? 0x293345 : 0x202a38, 0.75);
        graphics.lineStyle(Math.max(1, this.#scale), 0x64758b, 0.65);
        for (const cell of terrain.cells) {
          graphics.fillPoints(hexCorners(cell, layout.radius), true);
          graphics.strokePoints(hexCorners(cell, layout.radius), true);
        }
      });
    }
    tokenGraphics.clear();

    const activeSlots = new Set(this.#players.map(({ slot }) => slot));
    for (const [slot, zone] of this.#zones) {
      if (activeSlots.has(slot)) continue;
      zone.destroy();
      this.#zones.delete(slot);
      this.#zoneDiameters.delete(slot);
      this.#positions.delete(slot);
      this.#labels.get(slot)?.forEach((label) => label.destroy());
      this.#labels.delete(slot);
    }
    for (const [pointerId, drag] of this.#dragging) {
      if (!activeSlots.has(drag.slot)) {
        this.#dragging.delete(pointerId);
        this.#interaction?.onPressed(drag.slot, false);
      }
    }

    for (const player of this.#players) {
      const { slot, attributes } = player;
      const diameter = layout.tokenDiameter;
      const position = this.#positions.get(slot);
      if (!position) {
        this.#positions.set(slot, this.startingPosition(slot, layout.area, diameter));
      } else {
        this.#positions.set(slot, this.constrainPosition(position, layout.area, diameter));
      }
      const center = this.#positions.get(slot);
      if (!center) continue;

      tokenGraphics.fillStyle(0x1678cf, 0.95);
      tokenGraphics.fillCircle(center.x, center.y, diameter * 0.24);
      tokenGraphics.lineStyle(Math.max(1, diameter * 0.025), 0x84a8c1, 0.9);
      tokenGraphics.strokeCircle(center.x, center.y, diameter * 0.49);
      const groupStarts = [-2.57, -0.48, 1.62];
      const values = [attributes.strength, attributes.dexterity, attributes.wisdom];
      for (let group = 0; group < values.length; group++) {
        const groupStart = groupStarts[group];
        const value = values[group];
        if (groupStart === undefined || value === undefined) continue;
        for (let segment = 0; segment < 3; segment++) {
          const start = groupStart + segment * 0.4;
          tokenGraphics.lineStyle(
            Math.max(1, diameter * 0.045),
            segment < value ? 0x75d9f4 : 0x596777,
            segment < value ? 0.95 : 0.45,
          );
          tokenGraphics.beginPath();
          tokenGraphics.arc(center.x, center.y, diameter * 0.39, start, start + 0.27);
          tokenGraphics.strokePath();
        }
      }

      this.updateLabels(slot, center, diameter);
      this.updateZone(slot, center, diameter);
    }

    if (updateSummary) {
      this.game.events.emit("preview:layout", {
        terrains: layout.placements.length,
        cells: layout.placements.length * 7,
        cellWidth: layout.width,
        tokenDiameter: layout.tokenDiameter,
      } satisfies LayoutSummary);
    }
  }

  private currentLayout() {
    const width = this.#snapshot?.arena.width ?? this.scale.width;
    const height = this.#snapshot?.arena.height ?? this.scale.height;
    const sourceArea = boardArea(width, height, this.#scale);
    const targetArea = boardArea(this.scale.width, this.scale.height, this.#scale);
    const zoom = Math.min(targetArea.width / sourceArea.width, targetArea.height / sourceArea.height);
    this.cameras.main.setZoom(zoom).centerOn(width / 2, height / 2);
    if (!this.#layout || width !== this.#layoutWidth || height !== this.#layoutHeight
      || this.#scale !== this.#layoutScale) {
      this.#layout = terrainLayout(width, height, this.#scale);
      this.#layoutWidth = width;
      this.#layoutHeight = height;
      this.#layoutScale = this.#scale;
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

  private updateLabels(slot: number, center: Position, diameter: number) {
    let labels = this.#labels.get(slot);
    if (!labels) {
      labels = ["F", "D", "I"].map((letter) =>
        this.add.text(0, 0, letter, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "8px",
          color: "#e6edf3",
          fontStyle: "bold",
        }).setOrigin(0.5),
      );
      this.#labels.set(slot, labels);
    }
    const offset = diameter * 0.105;
    labels.forEach((label, index) => {
      label.setPosition(center.x + (index - 1) * offset, center.y);
      label.setFontSize(Math.max(6, diameter * 0.125));
    });
  }

  private updateZone(slot: number, center: Position, diameter: number) {
    let zone = this.#zones.get(slot);
    if (!zone) {
      zone = this.add.zone(center.x, center.y, diameter, diameter);
      zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!this.#snapshot?.controlSlots.includes(slot)
          || !["lobby", "countdown", "running"].includes(this.#snapshot.phase)
          || this.#snapshot.players.find((p) => p.slot === slot)?.pressed
          || [...this.#dragging.values()].some((d) => d.slot === slot)) return;
        const position = this.#positions.get(slot);
        if (!position) return;
        this.#dragging.set(pointer.id, {
          slot,
          offsetX: position.x - pointer.worldX,
          offsetY: position.y - pointer.worldY,
        });
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
