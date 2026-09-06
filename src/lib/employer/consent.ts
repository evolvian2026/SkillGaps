/**
 * The notice a student agrees to when sharing their profile with an employer.
 *
 * Kept out of the server-actions module so the exact wording can be imported
 * by pages and stored verbatim on the consent record. When this text changes,
 * existing records keep pointing at the wording that was actually shown.
 */
export const SHARE_NOTICE = `Sharing your profile with this employer lets them see your name, your institution, your assessment and mock interview results, and your placement readiness score.

It does not share your email address, your resume, or your individual answers. You can withdraw this at any time from this page, and the employer loses access immediately.`;
