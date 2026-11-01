UPDATE characters
SET definition = jsonb_set(
  definition,
  '{attributes}',
  ((definition -> 'attributes') - 'speed')
    || jsonb_build_object('dexterity', definition #> '{attributes,speed}')
)
WHERE definition -> 'attributes' ? 'speed';

UPDATE monsters
SET definition = jsonb_set(
  definition,
  '{attributes}',
  ((definition -> 'attributes') - 'speed')
    || jsonb_build_object('dexterity', definition #> '{attributes,speed}')
)
WHERE definition -> 'attributes' ? 'speed';

UPDATE game_settings
SET revision = revision + 1, updated_at = now()
WHERE id = 'default';
