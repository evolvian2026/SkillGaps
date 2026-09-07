/**
 * Rejects anything that cannot be an id before it reaches the database.
 *
 * Postgres raises on an invalid uuid literal, so a probe like
 * `/practice/../../etc/passwd` would surface as a 500 — an error page that
 * says more about the stack than a plain "not found" does. Checking the shape
 * first turns every such probe into a 404.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
