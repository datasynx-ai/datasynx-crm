import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";

interface DynamicsContact {
  contactid: string;
  fullname?: string;
  emailaddress1?: string;
  telephone1?: string;
  _parentcustomerid_value?: string;
}

interface DynamicsActivity {
  activityid: string;
  activitytypecode?: string;
  subject?: string;
  description?: string;
  actualstart?: string;
  _regardingobjectid_value?: string;
}

interface ODataResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

async function* fetchWithNextLink<T>(
  firstUrl: string,
  token: string
): AsyncGenerator<T> {
  let url: string | undefined = firstUrl;
  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Dynamics API error: ${res.status}`);
    const data = (await res.json()) as ODataResponse<T>;
    for (const item of data.value) yield item;
    url = data["@odata.nextLink"];
  }
}

export const DynamicsConnector: CrmConnector = {
  name: "Dynamics 365",

  async *fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact> {
    const url = `${instanceUrl}/api/data/v9.2/contacts?$select=contactid,fullname,emailaddress1,telephone1&$top=1000`;
    for await (const c of fetchWithNextLink<DynamicsContact>(url, token)) {
      yield {
        id: c.contactid,
        name: c.fullname ?? "Unknown",
        email: c.emailaddress1,
        phone: c.telephone1,
      };
    }
  },

  async *fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity> {
    const url = `${instanceUrl}/api/data/v9.2/activitypointers?$select=activityid,activitytypecode,subject,description,actualstart,_regardingobjectid_value&$top=1000`;
    for await (const a of fetchWithNextLink<DynamicsActivity>(url, token)) {
      yield {
        id: a.activityid,
        contactId: a._regardingobjectid_value,
        type: a.activitytypecode ?? "Other",
        subject: a.subject,
        notes: a.description,
        date: a.actualstart ? new Date(a.actualstart).toISOString().slice(0, 10) : undefined,
      };
    }
  },
};
