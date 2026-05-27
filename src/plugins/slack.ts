import type { DxcrmPlugin } from "../core/plugin-registry.js";

export interface SlackPluginConfig {
  webhookUrl: string;
  channel?: string;
  notifyOn: Array<"new_interaction" | "deal_won" | "deal_lost" | "new_customer">;
}

async function sendSlackMessage(webhookUrl: string, text: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export interface SlackPlugin extends DxcrmPlugin {
  afterLogInteraction(slug: string, summary: string): Promise<void>;
  afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void>;
}

export function createSlackPlugin(config: SlackPluginConfig): SlackPlugin {
  return {
    name: "slack",
    version: "1.0.0",
    description: "Slack notifications for CRM events",
    mcpTools: [],

    async onInstall() {
      await sendSlackMessage(config.webhookUrl, "DatasynxOpenCRM Slack plugin installed.");
    },

    async afterLogInteraction(slug: string, summary: string): Promise<void> {
      if (!config.notifyOn.includes("new_interaction")) return;
      await sendSlackMessage(
        config.webhookUrl,
        `New interaction logged for *${slug}*: ${summary.slice(0, 200)}`
      );
    },

    async afterDealUpdate(slug: string, dealName: string, stage: string): Promise<void> {
      if (stage === "won" && config.notifyOn.includes("deal_won")) {
        await sendSlackMessage(config.webhookUrl, `Deal WON: *${dealName}* for ${slug}`);
      }
      if (stage === "lost" && config.notifyOn.includes("deal_lost")) {
        await sendSlackMessage(config.webhookUrl, `Deal LOST: *${dealName}* for ${slug}`);
      }
    },
  };
}
