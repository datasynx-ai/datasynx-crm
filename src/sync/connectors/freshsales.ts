import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface FreshContact {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_number?: string;
  company?: { name?: string };
}

interface FreshActivity {
  id: number;
  type?: string;
  title?: string;
  description?: string;
  created_at?: string;
  targetable_id?: number;
}

interface FreshResponse<T> {
  contacts?: T[];
  activities?: T[];
  meta?: { total_pages?: number };
}

export const FreshsalesConnector: CrmConnector = {
  name: "Freshsales",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    let page = 1;
    while (true) {
      const url = `${instanceUrl}/api/contacts/view/1?page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Token token=${token}` },
      });
      if (!res.ok) break;
      const data = (await res.json()) as FreshResponse<FreshContact>;
      if (!data.contacts?.length) break;
      for (const c of data.contacts) {
        yield {
          id: String(c.id),
          name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unknown",
          email: c.email,
          phone: c.mobile_number,
          company: c.company?.name,
        };
      }
      if (!data.meta?.total_pages || page >= data.meta.total_pages) break;
      page++;
    }
  },

  async *fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity> {
    let page = 1;
    while (true) {
      const url = `${instanceUrl}/api/activities?page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Token token=${token}` },
      });
      if (!res.ok) break;
      const data = (await res.json()) as FreshResponse<FreshActivity>;
      if (!data.activities?.length) break;
      for (const a of data.activities) {
        yield {
          id: String(a.id),
          contactId: a.targetable_id ? String(a.targetable_id) : undefined,
          type: a.type ?? "Other",
          subject: a.title,
          notes: a.description,
          date: a.created_at ? new Date(a.created_at).toISOString().slice(0, 10) : undefined,
        };
      }
      if (!data.meta?.total_pages || page >= data.meta.total_pages) break;
      page++;
    }
  },
};
