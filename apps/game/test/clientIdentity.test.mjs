import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { getClientId } from "../src/clientIdentity.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("generates and stores a UUID v4 without randomUUID on an HTTP origin", () => {
  const storage = createStorage();
  const random = { getRandomValues: (bytes) => bytes.fill(255) };
  const id = getClientId(storage, random);
  assert.equal(id, "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.equal(storage.getItem("terror-client-id"), id);
});

test("reuses the same identity after reload without generating another UUID", () => {
  const storage = createStorage();
  const id = getClientId(storage, webcrypto);
  assert.equal(getClientId(storage, {
    getRandomValues: () => { throw new Error("must not generate"); },
  }), id);
});

test("separate tabs receive distinct UUID v4 identities accepted by the server format", () => {
  const ids = Array.from({ length: 100 }, () => getClientId(createStorage(), webcrypto));
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("storage read and write failures propagate instead of using a transient identity", () => {
  const failure = new Error("storage blocked");
  assert.throws(() => getClientId({
    getItem: () => { throw failure; },
    setItem: () => {},
  }, webcrypto), (error) => error === failure);
  assert.throws(() => getClientId({
    getItem: () => null,
    setItem: () => { throw failure; },
  }, webcrypto), (error) => error === failure);
});

test("random generation failure propagates without storing a fallback", () => {
  const storage = createStorage();
  const failure = new Error("random unavailable");
  assert.throws(() => getClientId(storage, {
    getRandomValues: () => { throw failure; },
  }), (error) => error === failure);
  assert.equal(storage.getItem("terror-client-id"), null);
});
