import assert from "node:assert/strict";
import { test } from "node:test";
import type { Catalog } from "@terror/contracts";
import { readConfig } from "../config.js";
import { Match } from "../match.js";

const catalog: Catalog = {
  revision: 1,
  settings: { maxPlayers: 8, minimumTouchPoints: 10, countdownSeconds: 10, moduleCells: 7, rotationStepDegrees: 60 },
  characters: [{ id: "test", name: "Test", attributes: { strength: 2, dexterity: 2, wisdom: 2 }, health: 3 }],
  monsters: [{
    id: "test", name: "Test", attributes: { strength: 2, dexterity: 2, wisdom: 2 },
    movementMultiplier: 1.2, capabilities: ["sleep"], trapLimit: 3, sleepingVisionMultiplier: 0.1,
  }],
};

test("match keeps its own configuration copy and returns isolated snapshots", () => {
  const source = structuredClone(catalog);
  const match = new Match(source);
  source.revision = 8;
  const returned = match.catalog();
  returned.revision = 9;
  assert.equal(match.catalog().revision, 1);
  assert.equal(match.snapshot().catalogRevision, 1);
  assert.equal(match.snapshot().id, match.snapshot().id);
});

test("a fresh server match gets a new identity instead of restoring state", () => {
  assert.notEqual(new Match(catalog).snapshot().id, new Match(catalog).snapshot().id);
});

test("configuration rejects missing or example secrets without exposing them", () => {
  assert.throws(() => readConfig({}), /Invalid server configuration/);
  const placeholder = "replace-with-a-random-password";
  assert.throws(() => readConfig({
    POSTGRES_PASSWORD: placeholder,
  }), (error: unknown) => error instanceof Error && !error.message.includes(placeholder));
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
  }).PORT, 3000);
});
