/**
 * User-facing vocabulary.
 *
 * The backend calls the thing Radar scans for a "profile". That word now
 * belongs to Prosopia researcher profiles, so the UI says "interest"
 * instead. Every label goes through this table; changing the word again
 * is a one-file edit. API paths are unaffected.
 */
export const TERMS = {
  interest: 'interest',
  interests: 'interests',
  Interest: 'Interest',
  Interests: 'Interests',
  newInterest: 'New interest',
  feed: 'Feed',
  vault: 'Vault',
  scan: 'scan',
  Scan: 'Scan',
} as const;
