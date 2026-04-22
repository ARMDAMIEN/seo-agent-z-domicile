import "dotenv/config";
import { google } from "googleapis";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// One-shot helper to obtain a refresh token scoped for Google Search Console read access.
// Prereqs:
//   1. In Google Cloud console, create an OAuth 2.0 Client (type: "Desktop").
//      (Org policies that block service-account keys do NOT affect OAuth clients — this works.)
//   2. Put client_id and client_secret in .env as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
//   3. Run: npm run gsc:token
//   4. Open the printed URL, sign in with a Google account that has access to the GSC property, approve.
//   5. Google will redirect to a localhost URL that probably fails to load — that's fine.
//      Copy the `code=...` value from the URL bar and paste it below.
//   6. Copy the printed refresh_token into .env as GSC_REFRESH_TOKEN.

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first. " +
        "If you previously stored these as GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET, just rename them."
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1) Open this URL in your browser and approve (sign in as a Google account that has GSC access on z-domicile.fr):\n");
  console.log(url);
  console.log("\n2) Google will show you a code. Paste it below.\n");

  const rl = createInterface({ input, output });
  const code = (await rl.question("Authorization code: ")).trim();
  rl.close();

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke the app's access in your Google account settings (https://myaccount.google.com/permissions) and try again."
    );
  }
  console.log("\n✅ Success. Add this to your .env:\n");
  console.log(`GSC_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
