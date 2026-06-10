import fs from "fs";
import path from "path";

/** Read the stored Google access token (mirrors getMicrosoftToken). */
export async function getGoogleToken(dataDir: string): Promise<string | null> {
  const tokenPath = path.join(dataDir, ".agentic", "google-token.json");
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(tokenPath, "utf-8") as string) as {
      accessToken?: string;
      access_token?: string;
    };
    return raw.accessToken ?? raw.access_token ?? null;
  } catch {
    return null;
  }
}
