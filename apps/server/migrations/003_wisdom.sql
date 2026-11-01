UPDATE characters
SET definition = jsonb_set(
  definition,
  '{attributes}',
  ((definition -> 'attributes') - 'intelligence')
    || jsonb_build_object('wisdom', definition #> '{attributes,intelligence}')
)
WHERE definition -> 'attributes' ? 'intelligence';

UPDATE monsters
SET definition = jsonb_set(
  definition,
  '{attributes}',
  ((definition -> 'attributes') - 'intelligence')
    || jsonb_build_object('wisdom', definition #> '{attributes,intelligence}')
)
WHERE definition -> 'attributes' ? 'intelligence';

UPDATE game_settings
SET revision = revision + 1, updated_at = now()
WHERE id = 'default';
