import { randomUUID } from "node:crypto";
import {
  catalogSchema,
  matchSnapshotSchema,
  type Catalog,
  type MatchSnapshot,
} from "@terror/contracts";

export class Match {
  readonly #catalog: Catalog;
  readonly #id = randomUUID();

  constructor(catalog: Catalog) {
    this.#catalog = catalogSchema.parse(catalog);
  }

  catalog(): Catalog {
    return structuredClone(this.#catalog);
  }

  snapshot(): MatchSnapshot {
    return matchSnapshotSchema.parse({
      id: this.#id,
      phase: "lobby",
      catalogRevision: this.#catalog.revision,
    });
  }
}
