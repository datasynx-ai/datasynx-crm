import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface MondayItem {
  id: string;
  name: string;
  column_values?: Array<{ id: string; text?: string }>;
}

interface MondayPage {
  items: MondayItem[];
  cursor?: string;
}

export const MondayConnector: CrmConnector = {
  name: "Monday.com",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    const boardId = instanceUrl; // instanceUrl used as boardId for Monday
    let cursor: string | undefined;

    do {
      const query = cursor
        ? `{ next_items_page(limit:100,cursor:"${cursor}") { cursor items { id name column_values { id text } } } }`
        : `{ boards(ids:[${boardId}]) { items_page(limit:100) { cursor items { id name column_values { id text } } } } }`;

      const res = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`Monday API error: ${res.status}`);

      const data = (await res.json()) as {
        data?: {
          boards?: Array<{ items_page?: MondayPage }>;
          next_items_page?: MondayPage;
        };
      };
      const page = cursor
        ? data.data?.next_items_page
        : data.data?.boards?.[0]?.items_page;

      if (!page?.items?.length) break;

      for (const item of page.items) {
        const emailCol = item.column_values?.find((c) => c.id.includes("email"))?.text;
        const phoneCol = item.column_values?.find((c) => c.id.includes("phone"))?.text;
        yield { id: item.id, name: item.name, email: emailCol, phone: phoneCol };
      }

      cursor = page.cursor;
    } while (cursor);
  },

  async *fetchActivities(_token: string, _instanceUrl: string): AsyncGenerator<CrmActivity> {
    // Monday doesn't have a native activities concept — yield nothing
  },
};
