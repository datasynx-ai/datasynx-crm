import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface CopperPerson {
  id: number;
  name: string;
  emails?: Array<{ email?: string }>;
  phone_numbers?: Array<{ number?: string }>;
  company_name?: string;
}

interface CopperActivity {
  id: number;
  type?: { category?: string };
  details?: string;
  activity_date?: number; // Unix timestamp
  parent?: { id?: number; type?: string };
}

interface CopperSearchResponse<T> {
  data?: T[];
}

async function copperPost<T>(
  token: string,
  email: string,
  url: string,
  body: Record<string, unknown>
): Promise<T[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-PW-AccessToken": token,
      "X-PW-Application": "developer_api",
      "X-PW-UserEmail": email,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Copper API error: ${res.status}`);
  const data = (await res.json()) as CopperSearchResponse<T>;
  return data.data ?? [];
}

export function makeCopperConnector(email: string): CrmConnector {
  return {
    name: "Copper",

    async *fetchContacts(token: string, _instanceUrl: string): AsyncGenerator<CrmContact> {
      let page = 1;
      while (true) {
        const items = await copperPost<CopperPerson>(
          token,
          email,
          "https://api.copper.com/developer_api/v1/people/search",
          { page_size: 200, page_number: page }
        );
        if (!items.length) break;
        for (const p of items) {
          yield {
            id: String(p.id),
            name: p.name,
            email: p.emails?.[0]?.email,
            phone: p.phone_numbers?.[0]?.number,
            company: p.company_name,
          };
        }
        if (items.length < 200) break;
        page++;
      }
    },

    async *fetchActivities(token: string, _instanceUrl: string): AsyncGenerator<CrmActivity> {
      let page = 1;
      while (true) {
        const items = await copperPost<CopperActivity>(
          token,
          email,
          "https://api.copper.com/developer_api/v1/activities/search",
          { page_size: 200, page_number: page }
        );
        if (!items.length) break;
        for (const a of items) {
          yield {
            id: String(a.id),
            type: a.type?.category ?? "Other",
            notes: a.details,
            date: a.activity_date
              ? new Date(a.activity_date * 1000).toISOString().slice(0, 10)
              : undefined,
          };
        }
        if (items.length < 200) break;
        page++;
      }
    },
  };
}
