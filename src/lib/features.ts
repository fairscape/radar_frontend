/**
 * Features switched off in this build.
 *
 * CHAT_ENABLED -- "Ask your papers", the chat over the vault. Off from
 * 2026-10-01 while the rest of Radar is being tested: it answers each
 * question with no memory of the previous ones, testers asked what that
 * meant, and it is not what this round of testing is about. Off here hides
 * every way in -- the Vault page's chat panel, the home page's step 3, the
 * nav hint and the Vault subtitle. The backend's /api/chat routes are left
 * as they are; nothing in the UI calls them while this is false.
 */
export const CHAT_ENABLED = false;
