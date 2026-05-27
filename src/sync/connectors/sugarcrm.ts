import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface SugarRecord {
  id: string;
  full_name?: string;
  name?: string;
  email1?: string;
  phone_mobile?: string;
  account_name?: string;
}

interface SugarActivity {
  id: string;
  activity_type?: string;
  name?: string;
  description?: string;
  date_start?: string;
  contact_id?: string;
}

interface SugarResponse<T> {
  records?: T[];
  next_offset?: number;
}

export const SugarCRMConnector: CrmConnector = {
  name: "SugarCRM",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    let offset = 0;
    while (true) {
      const url = `${instanceUrl}/rest/v11_1/Contacts?max_num=100&offset=${offset}&fields=id,full_name,email1,phone_mobile,account_name`;
      const res = await fetch(url, {
        headers: { "OAuth-Token": token },
      });
      if (!res.ok) break;
      const data = (await res.json()) as SugarResponse<SugarRecord>;
      if (!data.records?.length) break;
      for (const r of data.records) {
        yield {
          id: r.id,
          name: r.full_name ?? r.name ?? "Unknown",
          email: r.email1,
          phone: r.phone_mobile,
          company: r.account_name,
        };
      }
      if (data.next_offset === -1 || !data.records.length) break;
      offset = data.next_offset ?? offset + 100;
    }
  },

  async *fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity> {
    let offset = 0;
    while (true) {
      const url = `${instanceUrl}/rest/v11_1/Activities?max_num=100&offset=${offset}&fields=id,activity_type,name,description,date_start,contact_id`;
      const res = await fetch(url, {
        headers: { "OAuth-Token": token },
      });
      if (!res.ok) break;
      const data = (await res.json()) as SugarResponse<SugarActivity>;
      if (!data.records?.length) break;
      for (const a of data.records) {
        yield {
          id: a.id,
          contactId: a.contact_id,
          type: a.activity_type ?? "Other",
          subject: a.name,
          notes: a.description,
          date: a.date_start ? new Date(a.date_start).toISOString().slice(0, 10) : undefined,
        };
      }
      if (data.next_offset === -1 || !data.records.length) break;
      offset = data.next_offset ?? offset + 100;
    }
  },
};
