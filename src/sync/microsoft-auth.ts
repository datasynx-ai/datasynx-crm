import fs from "fs";
import path from "path";

export async function getMicrosoftToken(dataDir: string): Promise<string | null> {
  const tokenPath = path.join(dataDir, ".agentic", "microsoft-token.json");
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
