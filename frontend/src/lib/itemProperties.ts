/**
 * `additional_properties` is a free-form JSONB bag on category_items, used for small UI
 * flags without a migration per flag. The database enforces nothing about its shape, so
 * every read and write goes through here — otherwise the shape drifts into scattered
 * `?.favourite` guesses and typos fail silently.
 *
 * Keep security-relevant state out of it: it has no constraints and no type checking.
 */
export type AdditionalProperties = {
  favourite?: boolean;
  [key: string]: unknown;
};

type WithProperties = { additional_properties?: AdditionalProperties | null };

export function isFavourite(item: WithProperties): boolean {
  return item.additional_properties?.favourite === true;
}

/**
 * Returns the whole bag with `patch` applied. Writes replace the entire value, so the
 * caller must send everything it wants kept — merging here is what preserves other keys.
 * Keys set to undefined are dropped.
 */
export function mergeProperties(
  item: WithProperties,
  patch: AdditionalProperties,
): AdditionalProperties {
  const merged: AdditionalProperties = { ...(item.additional_properties ?? {}), ...patch };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}
