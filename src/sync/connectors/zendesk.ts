import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface ZendeskContact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  organization_name?: string;
}

interface ZendeskActivity {
  id: number;
  type?: string;
  subject?: string;
  notes?: string;
  created_at?: string;
  contact_id?: number;
}

interface ZendeskPage<T> {
  items?: Array<{ data: T }>;
  meta?: { has_more?: boolean; next_cursor?: string };
}

export const ZendeskConnector: CrmConnector = {
  name: "Zendesk Sell",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    let cursor: string | undefined;
    do {
      const url = cursor
        ? `${instanceUrl}/v2/contacts?cursor=${cursor}&count=100`
        : `${instanceUrl}/v2/contacts?count=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;
      const data = (await res.json()) as ZendeskPage<ZendeskContact>;
      if (!data.items?.length) break;
      for (const item of data.items) {
        const c = item.data;
        yield {
          id: String(c.id),
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.organization_name,
        };
      }
      cursor = data.meta?.has_more ? data.meta.next_cursor : undefined;
    } while (cursor);
  },

  async *fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity> {
    let cursor: string | undefined;
    do {
      const url = cursor
        ? `${instanceUrl}/v2/activities?cursor=${cursor}&count=100`
        : `${instanceUrl}/v2/activities?count=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;
      const data = (await res.json()) as ZendeskPage<ZendeskActivity>;
      if (!data.items?.length) break;
      for (const item of data.items) {
        const a = item.data;
        yield {
          id: String(a.id),
          contactId: a.contact_id ? String(a.contact_id) : undefined,
          type: a.type ?? "Other",
          subject: a.subject,
          notes: a.notes,
          date: a.created_at ? new Date(a.created_at).toISOString().slice(0, 10) : undefined,
        };
      }
      cursor = data.meta?.has_more ? data.meta.next_cursor : undefined;
    } while (cursor);
  },
};
