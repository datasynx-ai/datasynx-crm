import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface ZohoRecord {
  id: string;
  Full_Name?: string;
  Email?: string;
  Phone?: string;
  Account_Name?: { name?: string };
}

interface ZohoActivity {
  id: string;
  Activity_Type?: string;
  Subject?: string;
  Description?: string;
  Due_Date?: string;
  Who_Id?: { id?: string };
}

interface ZohoResponse<T> {
  data?: T[];
  info?: { more_records?: boolean; page?: number };
}

export const ZohoConnector: CrmConnector = {
  name: "Zoho CRM",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    let page = 1;
    while (true) {
      const url = `${instanceUrl}/crm/v8/Contacts?page=${page}&per_page=200`;
      const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (!res.ok) throw new Error(`Zoho API error: ${res.status}`);
      const data = (await res.json()) as ZohoResponse<ZohoRecord>;
      if (!data.data?.length) break;
      for (const r of data.data) {
        yield {
          id: r.id,
          name: r.Full_Name ?? "Unknown",
          email: r.Email,
          phone: r.Phone,
          company: r.Account_Name?.name,
        };
      }
      if (!data.info?.more_records) break;
      page++;
    }
  },

  async *fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity> {
    let page = 1;
    while (true) {
      const url = `${instanceUrl}/crm/v8/Activities?page=${page}&per_page=200`;
      const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (!res.ok) break;
      const data = (await res.json()) as ZohoResponse<ZohoActivity>;
      if (!data.data?.length) break;
      for (const a of data.data) {
        yield {
          id: a.id,
          contactId: a.Who_Id?.id,
          type: a.Activity_Type ?? "Other",
          subject: a.Subject,
          notes: a.Description,
          date: a.Due_Date,
        };
      }
      if (!data.info?.more_records) break;
      page++;
    }
  },
};
