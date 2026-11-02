import { randomUUID } from "node:crypto";
import {
  BASE_MOVEMENT_CELLS_PER_SECOND, catalogSchema,
  matchSnapshotSchema, playerVisionRadiusSchema,
  allocateAttributePoint, generateTerrainMap, initialPlayerAttributes, playerAttributesSchema,
  matchCommandSchema, moveWithinTerrain, movementMultiplier, terrainLayout, terrainMapCells,
  visibleTerrainCellIndices, initialTokenPosition,
  type CommandResult, type MatchPlayer,
  type Catalog,
  type GeneratedTerrainMap,
  type MatchSnapshot,
  type PublicCatalog,
} from "@terror/contracts";

export class Match {
  readonly #catalog: Catalog;
  readonly #id = randomUUID();
  #players = new Map<number, MatchPlayer>();
  #owners = new Map<number, string>();
  #connected = new Set<string>();
  #arena = { width: 1920, height: 1200, scale: 1 };
  #phase: MatchSnapshot["phase"] = "lobby";
  #remainingMs = 0;
  #resumeRemainingMs = 0;
  #simulationMs = 0;
  #resumePhase: "chapter" | "running" = "running";
  #lastTime: number;
  #chapter = "";
  #error = "";
  #terrain: GeneratedTerrainMap | null = null;
  #terrainCells: ReturnType<typeof terrainMapCells> = [];
  #exploredTerrainCells = new Map<string, MatchSnapshot["exploredTerrainCells"][number]>();
  #visibleTerrainCellKeys: string[] = [];
  #visionStateKey: string | null = null;
  #lastMoveSimulationMs = new Map<number, number>();
  readonly #visionRadiusCells: number;
  readonly #now: () => number;

  constructor(
    catalog: Catalog,
    now: () => number = () => performance.now(),
    visionRadiusCells = 3,
  ) {
    this.#catalog = catalogSchema.parse(catalog);
    this.#now = now;
    this.#visionRadiusCells = playerVisionRadiusSchema.parse(visionRadiusCells);
    this.#lastTime = now();
  }

  catalog(): Catalog {
    return structuredClone(this.#catalog);
  }

  publicCatalog(): PublicCatalog {
    return {
      revision: this.#catalog.revision,
      settings: structuredClone(this.#catalog.settings),
      characters: structuredClone(this.#catalog.characters),
      monsters: this.#catalog.monsters.map(({ id, name }) => ({ id, name })),
    };
  }

  snapshot(owner?: string): MatchSnapshot {
    this.#refreshVision();
    return matchSnapshotSchema.parse({
      id: this.#id,
      phase: this.#phase,
      catalogRevision: this.#catalog.revision,
      players: [...this.#players.values()].sort((a, b) => a.slot - b.slot),
      arena: this.#arena,
      remainingMs: this.#remainingMs,
      resumeRemainingMs: this.#resumeRemainingMs,
      simulationMs: this.#simulationMs,
      chapter: this.#chapter,
      error: this.#error,
      controlSlots: owner ? [...this.#owners].filter(([, o]) => o === owner).map(([slot]) => slot).sort((a, b) => a - b) : [],
      visionRadiusCells: this.#visionRadiusCells,
      exploredTerrainCells: [...this.#exploredTerrainCells.values()],
      visibleTerrainCellKeys: this.#visibleTerrainCellKeys,
    });
  }

  #refreshVision() {
    const active = this.#terrain && ["chapter", "running", "paused"].includes(this.#phase);
    const stateKey = `${active ? this.#terrain?.seed : ""}|${this.#phase}|${[...this.#players.values()]
      .map(({ slot, position }) => `${slot}:${position.x}:${position.y}`).join(";")}`;
    if (stateKey === this.#visionStateKey) return;
    this.#visionStateKey = stateKey;
    this.#visibleTerrainCellKeys = [];
    if (!active) return;

    const visibleIndices = visibleTerrainCellIndices(
      [...this.#players.values()].map(({ position }) => ({ position })),
      this.#terrainCells,
      this.#arena.width,
      this.#arena.height,
      this.#arena.scale,
      this.#visionRadiusCells,
    );
    for (const index of visibleIndices) {
      const cell = this.#terrainCells[index];
      if (!cell) continue;
      const key = `${cell.q},${cell.r}`;
      this.#exploredTerrainCells.set(key, { q: cell.q, r: cell.r, terrainType: cell.terrainType });
      this.#visibleTerrainCellKeys.push(key);
    }
  }

  connect(owner: string) {
    this.#connected.add(owner);
    for (const [slot, player] of this.#players) {
      if (this.#owners.get(slot) === owner) player.connected = true;
    }
  }

  disconnect(owner: string) {
    this.tick();
    this.#connected.delete(owner);
    if (![...this.#owners.values()].includes(owner)) return;
    for (const [slot, player] of this.#players) {
      if (this.#owners.get(slot) !== owner) continue;
      player.connected = false;
      player.pressed = false;
      player.ready = false;
    }
    if (["chapter", "running"].includes(this.#phase) && this.#players.size > 0) this.#pause();
    if (this.#phase === "paused") {
      this.#players.forEach((p) => { p.resumeReady = false; });
      this.#resumeRemainingMs = 0;
    }
    if (this.#phase === "countdown") this.#cancelCountdown();
  }

  tick(): boolean {
    const time = this.#now();
    const delta = Math.max(0, time - this.#lastTime);
    this.#lastTime = time;
    if (delta === 0 || this.#phase === "lobby") return false;
    if (this.#phase === "paused") {
      if (this.#resumeRemainingMs === 0) return false;
      this.#resumeRemainingMs = Math.max(0, this.#resumeRemainingMs - delta);
      if (this.#resumeRemainingMs === 0) {
        this.#phase = this.#resumePhase;
        this.#players.forEach((p) => { p.resumeReady = false; });
      }
      return true;
    }
    if (this.#phase === "running") {
      this.#simulationMs += delta;
      return true;
    }
    this.#remainingMs = Math.max(0, this.#remainingMs - delta);
    if (this.#remainingMs > 0) return true;
    if (this.#phase === "countdown") {
      const layout = terrainLayout(this.#arena.width, this.#arena.height, this.#arena.scale);
      const cells = this.#terrain
        ? terrainMapCells(this.#terrain)
          .filter((cell) => cell.traversable)
          .map(({ q, r }) => ({
            x: this.#arena.width / 2 + layout.width * (q + r / 2),
            y: this.#arena.height / 2 + layout.radius * 1.5 * r,
          }))
        : [];
      if (cells.length < this.#players.size) {
        this.#error = "O mapa não comporta as posições iniciais. Ajuste a escala e confirme a prontidão novamente.";
        this.#cancelCountdown();
        this.#players.forEach((p) => { p.ready = false; });
        return true;
      }
      for (const player of this.#players.values()) {
        const target = initialTokenPosition(player.slot, layout.area, layout.tokenDiameter);
        cells.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
        const cell = cells.shift();
        if (cell) player.position = { x: cell.x, y: cell.y };
        player.pressed = false;
      }
      this.#chapter = "Capítulo 1: O silêncio da noite";
      this.#phase = "chapter";
      this.#remainingMs = 2000;
    } else {
      this.#phase = "running";
      this.#remainingMs = 0;
    }
    return true;
  }

  command(owner: string, value: unknown): CommandResult {
    this.tick();
    const parsed = matchCommandSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: "Comando inválido ou incompatível." };
    const command = parsed.data;
    const fail = (error: string): CommandResult => ({ ok: false, error });
    if (!this.#connected.has(owner)) return fail("Cliente desconectado.");
    if (command.type === "join") {
      if (this.#phase !== "lobby" && this.#phase !== "countdown") return fail("A partida já começou.");
      if (this.#players.has(command.slot)) return fail("Este setor já está ocupado.");
      if ([...this.#players.values()].some((p) => p.name === command.name)) return fail(`O nome ${command.name} já está em uso.`);
      if ([...this.#players.values()].some((p) => p.color === command.color)) return fail("A cor escolhida já está em uso. Escolha outra cor.");
      const layout = terrainLayout(this.#arena.width, this.#arena.height, this.#arena.scale);
      this.#players.set(command.slot, {
        slot: command.slot, name: command.name, color: command.color,
        attributes: initialPlayerAttributes(), ready: false,
        resumeReady: false, connected: true, pressed: false,
        position: initialTokenPosition(command.slot, layout.area, layout.tokenDiameter),
      });
      this.#lastMoveSimulationMs.set(command.slot, this.#simulationMs);
      this.#owners.set(command.slot, owner);
      this.#cancelCountdown();
      return { ok: true };
    }
    if (command.type === "viewport") {
      if (this.#phase !== "lobby" && this.#phase !== "countdown") return fail("O tamanho da partida está fixado.");
      if (this.#players.size && ![...this.#owners.values()].every((o) => o === owner)) return fail("A mesa já está configurada por outro cliente.");
      if (this.#arena.width === command.width && this.#arena.height === command.height) return { ok: true };
      this.#arena.width = command.width;
      this.#arena.height = command.height;
      this.#resetPreparation();
      return { ok: true };
    }
    const player = this.#players.get(command.slot);
    if (!player || this.#owners.get(command.slot) !== owner) return fail("Este jogador não pertence a este cliente.");
    if (command.type === "release") {
      player.pressed = false;
      this.#lastMoveSimulationMs.delete(command.slot);
      return { ok: true };
    }
    if (command.type === "move") {
      if (!player.pressed || !["lobby", "countdown", "running"].includes(this.#phase)) return fail("Movimento indisponível.");
      const layout = terrainLayout(this.#arena.width, this.#arena.height, this.#arena.scale);
      if (this.#phase === "running" && this.#terrain) {
        const previousTime = this.#lastMoveSimulationMs.get(command.slot) ?? this.#simulationMs;
        const elapsedMs = Math.min(250, Math.max(0, this.#simulationMs - previousTime));
        this.#lastMoveSimulationMs.set(command.slot, this.#simulationMs);
        player.position = moveWithinTerrain(
          this.#terrainCells,
          player.position,
          command.position,
          BASE_MOVEMENT_CELLS_PER_SECOND
            * movementMultiplier(player.attributes.dexterity)
            * layout.width
            * elapsedMs / 1000,
          this.#arena.width,
          this.#arena.height,
          this.#arena.scale,
        );
      } else {
        const radius = layout.tokenDiameter / 2;
        player.position = {
          x: Math.max(layout.area.x + radius, Math.min(layout.area.x + layout.area.width - radius, command.position.x)),
          y: Math.max(layout.area.y + radius, Math.min(layout.area.y + layout.area.height - radius, command.position.y)),
        };
      }
      return { ok: true };
    }
    if (player.pressed) return fail("Não é possível executar ação enquanto em movimento.");
    if (command.type === "press") {
      if (!["lobby", "countdown", "running"].includes(this.#phase)) return fail("Movimento indisponível durante pausa ou capítulo.");
      player.pressed = true;
      this.#lastMoveSimulationMs.set(command.slot, this.#simulationMs);
      return { ok: true };
    }
    if (command.type === "leave") {
      this.#players.delete(command.slot);
      this.#owners.delete(command.slot);
      this.#lastMoveSimulationMs.delete(command.slot);
      if (!this.#players.size) {
        this.#phase = "lobby";
        this.#simulationMs = 0;
        this.#chapter = "";
        this.#error = "";
        this.#terrain = null;
        this.#exploredTerrainCells.clear();
        this.#remainingMs = 0;
        this.#resumeRemainingMs = 0;
      } else if (this.#phase === "countdown") this.#cancelCountdown();
      else if (this.#phase === "paused") this.#resumeRemainingMs = 0;
      return { ok: true };
    }
    if (command.type === "pause") {
      if (this.#phase !== "running" && this.#phase !== "chapter") return fail("A partida não está em execução.");
      this.#pause();
      return { ok: true };
    }
    if (command.type === "resume") {
      if (this.#phase !== "paused") return fail("A partida não está pausada.");
      player.resumeReady = command.value;
      this.#tryResume();
      return { ok: true };
    }
    if (this.#phase !== "lobby" && this.#phase !== "countdown") return fail("A configuração está bloqueada após o início da partida.");
    if (command.type === "attribute") {
      const proposed = { ...player.attributes, [command.attribute]: player.attributes[command.attribute] + command.delta };
      const checked = playerAttributesSchema.safeParse(proposed);
      if (!checked.success) return fail("Respeite os níveis de 1 a 3 e os três pontos disponíveis.");
      player.attributes = allocateAttributePoint(player.attributes, command.attribute, command.delta);
      player.ready = false;
      this.#cancelCountdown();
    } else if (command.type === "scale") {
      this.#arena.scale = Math.min(2, Math.max(0.5, Math.round((this.#arena.scale + command.delta) * 20) / 20));
      this.#resetPreparation();
    } else if (command.type === "ready") {
      if (command.value) {
        if (this.#phase !== "countdown" && !this.#terrain) {
          const terrain = generateTerrainMap(
            this.#arena.width,
            this.#arena.height,
            this.#arena.scale,
            randomUUID(),
          );
          const availableCells = terrainMapCells(terrain).filter((cell) => cell.traversable).length;
          if (availableCells < this.#players.size) {
            return fail("O mapa modular não comporta todos os jogadores nesta escala.");
          }
          this.#terrain = terrain;
          this.#terrainCells = terrainMapCells(terrain);
        }
      }
      player.ready = command.value;
      this.#error = "";
      if (!command.value) this.#cancelCountdown();
      else if ([...this.#players.values()].every((p) => p.ready && p.connected)) {
        if (this.#phase !== "countdown") {
          this.#phase = "countdown";
          this.#remainingMs = 10000;
        }
      }
    }
    return { ok: true };
  }

  #cancelCountdown() {
    if (this.#phase === "countdown") this.#phase = "lobby";
    this.#remainingMs = 0;
    this.#terrain = null;
    this.#terrainCells = [];
    this.#terrainCells = [];
    this.#exploredTerrainCells.clear();
    this.#visibleTerrainCellKeys = [];
    this.#visionStateKey = null;
    this.#lastMoveSimulationMs.clear();
  }

  #resetPreparation() {
    this.#error = "";
    this.#cancelCountdown();
    const layout = terrainLayout(this.#arena.width, this.#arena.height, this.#arena.scale);
    this.#players.forEach((p) => {
      p.ready = false;
      p.pressed = false;
      p.position = initialTokenPosition(p.slot, layout.area, layout.tokenDiameter);
    });
  }

  #pause() {
    this.#resumePhase = this.#phase === "chapter" ? "chapter" : "running";
    this.#phase = "paused";
    this.#resumeRemainingMs = 0;
    this.#players.forEach((p) => {
      p.pressed = false;
      p.resumeReady = false;
      this.#lastMoveSimulationMs.delete(p.slot);
    });
  }

  #tryResume() {
    if ([...this.#players.values()].every((p) => p.resumeReady && p.connected)) {
      if (this.#resumeRemainingMs === 0) this.#resumeRemainingMs = 10000;
    } else this.#resumeRemainingMs = 0;
  }
}
