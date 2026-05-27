import { appendInteraction } from "../fs/interactions-writer.js";
import { indexInLanceDB } from "../core/lancedb.js";
import { readInteractions } from "../fs/interactions-writer.js";
import path from "path";
import fs from "fs";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
}

export interface DriveFilesResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveSyncOptions {
  slug: string;
  dataDir: string;
  accessToken: string;
  customerName?: string; // If not provided, use slug
  maxFiles?: number;
}

export interface DriveSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export async function syncGoogleDriveFiles(opts: DriveSyncOptions): Promise<DriveSyncResult> {
  const { slug, dataDir, accessToken } = opts;
  const searchName = opts.customerName ?? slug;
  const maxFiles = opts.maxFiles ?? 200;

  const result: DriveSyncResult = { synced: 0, skipped: 0, errors: [] };

  // Load existing interactions to detect already-synced files
  let existingInteractions = "";
  try {
    existingInteractions = await readInteractions(dataDir, slug);
  } catch {
    existingInteractions = "";
  }

  const encodedQuery = encodeURIComponent(
    `name contains "${searchName}" and mimeType!="application/vnd.google-apps.folder"`
  );
  const fields = encodeURIComponent(
    "files(id,name,mimeType,webViewLink,modifiedTime,size),nextPageToken"
  );

  let pageToken: string | undefined;
  let totalFetched = 0;

  do {
    let url =
      `${DRIVE_API_BASE}/files?q=${encodedQuery}&fields=${fields}&pageSize=50`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      result.errors.push(`Drive API request failed: ${(err as Error).message}`);
      break;
    }

    if (!response.ok) {
      result.errors.push(
        `Drive API error ${response.status}: ${await response.text().catch(() => "unknown")}`
      );
      break;
    }

    let data: DriveFilesResponse;
    try {
      data = (await response.json()) as DriveFilesResponse;
    } catch (err) {
      result.errors.push(`Failed to parse Drive API response: ${(err as Error).message}`);
      break;
    }

    const files = data.files ?? [];
    pageToken = data.nextPageToken;

    for (const file of files) {
      if (totalFetched >= maxFiles) break;
      totalFetched++;

      const sourceRef = `google://drive/${file.id}`;

      // Skip already-synced files
      if (existingInteractions.includes(sourceRef)) {
        result.skipped++;
        continue;
      }

      try {
        if (file.mimeType === GOOGLE_DOC_MIME) {
          // Export Google Doc as plain text
          const exportUrl = `${DRIVE_API_BASE}/files/${file.id}/export?mimeType=${encodeURIComponent("text/plain")}`;
          const exportRes = await fetch(exportUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!exportRes.ok) {
            result.errors.push(
              `Failed to export doc '${file.name}': HTTP ${exportRes.status}`
            );
            continue;
          }

          const text = await exportRes.text();

          // Save to attachments directory
          const attachmentsDir = path.join(dataDir, "customers", slug, "attachments");
          fs.mkdirSync(attachmentsDir, { recursive: true });
          const safeFilename = file.name.replace(/[/\\?%*:|"<>]/g, "-") + ".txt";
          fs.writeFileSync(path.join(attachmentsDir, safeFilename), text, "utf-8");

          // Append interaction
          await appendInteraction(dataDir, slug, {
            date: file.modifiedTime
              ? file.modifiedTime.slice(0, 10)
              : new Date().toISOString().slice(0, 10),
            type: "Note",
            with: "Google Drive",
            summary: `Attachment: ${file.name}`,
            nextSteps: [],
            sourceRef,
            synced: new Date().toISOString(),
          });

          // Index in LanceDB
          const lanceOpts: { date?: string; type?: string } = { type: "attachment" };
          if (file.modifiedTime) lanceOpts.date = file.modifiedTime.slice(0, 10);
          await indexInLanceDB(dataDir, slug, text.slice(0, 2000), sourceRef, lanceOpts);
        } else {
          // Non-Doc file: record via appendInteraction (no binary download)
          await appendInteraction(dataDir, slug, {
            date: file.modifiedTime
              ? file.modifiedTime.slice(0, 10)
              : new Date().toISOString().slice(0, 10),
            type: "Note",
            with: "Google Drive",
            summary: `Attachment: ${file.name}${file.webViewLink ? ` — ${file.webViewLink}` : ""}`,
            nextSteps: [],
            sourceRef,
            synced: new Date().toISOString(),
          });
        }

        result.synced++;
        existingInteractions += sourceRef; // prevent double-sync within same run
      } catch (err) {
        result.errors.push(
          `Error processing '${file.name}': ${(err as Error).message}`
        );
      }
    }

    if (totalFetched >= maxFiles) break;
  } while (pageToken);

  return result;
}
