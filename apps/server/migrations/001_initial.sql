CREATE TABLE game_settings (
  id text PRIMARY KEY,
  revision integer NOT NULL CHECK (revision > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
  id text PRIMARY KEY,
  definition jsonb NOT NULL CHECK (
    jsonb_typeof(definition) = 'object' AND definition ->> 'id' = id
  )
);

CREATE TABLE monsters (
  id text PRIMARY KEY,
  definition jsonb NOT NULL CHECK (
    jsonb_typeof(definition) = 'object' AND definition ->> 'id' = id
  )
);

INSERT INTO game_settings (id, revision, definition) VALUES (
  'default', 1,
  '{"maxPlayers":8,"minimumTouchPoints":10,"countdownSeconds":10,"moduleCells":7,"rotationStepDegrees":60}'
);

INSERT INTO characters (id, definition) VALUES (
  'survivor',
  '{"id":"survivor","name":"Sobrevivente (placeholder)","attributes":{"strength":2,"speed":2,"intelligence":2},"health":3}'
);

INSERT INTO monsters (id, definition) VALUES (
  'nightmare',
  '{"id":"nightmare","name":"Pesadelo (placeholder)","attributes":{"strength":2,"speed":2,"intelligence":2},"movementMultiplier":1.2,"capabilities":["sleep"],"trapLimit":3,"sleepingVisionMultiplier":0.1}'
);
