/**
 * The consent notice shown at signup, versioned.
 *
 * Kept as a constant rather than free text in the form so that the exact
 * wording a student agreed to is stored verbatim on their consent record. When
 * this text changes, bump CONSENT_VERSION — existing records keep pointing at
 * the wording that was actually shown.
 */
export const CONSENT_POLICY_KEY = "assessment_data_v1";
export const CONSENT_VERSION = "2026-09-01";

export const CONSENT_NOTICE = `We collect your name, college email address, and cohort details (branch, section, batch year), together with your assessment answers, scores and attempt timings.

We use this to generate your personal skill-gap report and to show your college's Training & Placement Officer aggregate, cohort-level insight. Your individual answers are visible to you and to authorised staff at your own institution only — never to another institution, and never to an employer at this stage.

You can ask us to export or delete your data at any time from your account page. Withdrawing consent does not affect processing already carried out.`;

export const CONSENT_SUMMARY_POINTS = [
  "Your name, college email and cohort details",
  "Your assessment answers, scores and attempt timings",
  "Shared only with authorised staff at your own institution",
  "Exportable and deletable on request, at any time",
];
