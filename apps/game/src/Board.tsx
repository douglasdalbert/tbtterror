import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { hexCorners, terrainLayout } from "@terror/contracts";

export interface LayoutSummary {
  terrains: number;
  cells: number;
  cellWidth: number;
  tokenDiameter: number;
}

class TerrainPreviewScene extends Phaser.Scene {
  #graphics: Phaser.GameObjects.Graphics | undefined;
  #scale = 1;

  create() {
    this.#graphics = this.add.graphics();
    this.#scale = this.registry.get("previewScale");
    this.drawBoard();
    this.scale.on("resize", this.drawBoard, this);
    this.game.events.on("preview:scale", this.changeScale, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.drawBoard, this);
      this.game.events.off("preview:scale", this.changeScale, this);
    });
  }

  changeScale(scale: number) {
    this.#scale = scale;
    this.drawBoard();
  }

  drawBoard() {
    const graphics = this.#graphics;
    if (!graphics) return;
    const layout = terrainLayout(this.scale.width, this.scale.height, this.#scale);
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
      graphics.fillStyle(0xa1b9c9, 0.8);
      graphics.fillCircle(terrain.center.x, terrain.center.y, layout.tokenDiameter / 2);
      graphics.lineStyle(3 * this.#scale, 0x445e6c);
      graphics.strokeCircle(terrain.center.x, terrain.center.y, layout.tokenDiameter * 0.38);
    });
    this.game.events.emit("preview:layout", {
      terrains: layout.placements.length,
      cells: layout.placements.length * 7,
      cellWidth: layout.width,
      tokenDiameter: layout.tokenDiameter,
    } satisfies LayoutSummary);
  }
}

export function Board({ scale, onLayout }: {
  scale: number;
  onLayout: (summary: LayoutSummary) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Phaser.Game>(null);
  useEffect(() => {
    if (!host.current) return;
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
          bootingGame.events.on("preview:layout", onLayout);
        },
      },
    });
    instance.current = game;
    return () => {
      game.events.off("preview:layout", onLayout);
      game.destroy(true);
      instance.current = null;
    };
  }, [onLayout]);
  useEffect(() => {
    instance.current?.registry.set("previewScale", scale);
    instance.current?.events.emit("preview:scale", scale);
  }, [scale]);
  return <div className="board" ref={host} aria-label="Prévia do mapa com vários terrenos de sete hexágonos" />;
}
