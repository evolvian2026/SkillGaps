/**
 * Roster values shared by server and client code.
 *
 * Deliberately a leaf module with no imports at all: `import.ts` carries
 * `server-only` and node crypto, so a client component reaching in there for a
 * constant would pull the whole server module into the browser bundle and fail
 * the build. Same reason `auth/routing.ts` exists.
 */

/** How long a join link stays valid. */
export const INVITATION_TTL_DAYS = 30;

/** A join link, returned once at the moment it is minted and never again. */
export interface IssuedLink {
  email: string;
  fullName: string;
  token: string;
}
