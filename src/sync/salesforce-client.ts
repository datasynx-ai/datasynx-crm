export interface SalesforceContact {
  Id: string;
  Name: string;
  Email?: string;
  Account?: { Website?: string };
}

export interface SalesforceTask {
  Id: string;
  Subject?: string;
  Description?: string;
  ActivityDate?: string;
  Type?: string;
  WhoId?: string;
}

interface SoqlResponse<T> {
  records: T[];
  totalSize: number;
  done: boolean;
}

export async function fetchSalesforceContacts(
  instanceUrl: string,
  token: string
): Promise<SalesforceContact[]> {
  const query = "SELECT+Id,Name,Email,Account.Website+FROM+Contact+LIMIT+200";
  const url = `${instanceUrl}/services/data/v58.0/query?q=${query}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Salesforce API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as SoqlResponse<SalesforceContact>;
  return data.records;
}

export async function fetchSalesforceTasks(
  instanceUrl: string,
  token: string
): Promise<SalesforceTask[]> {
  const query = "SELECT+Id,Subject,Description,ActivityDate,Type,WhoId+FROM+Task+LIMIT+500";
  const url = `${instanceUrl}/services/data/v58.0/query?q=${query}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Salesforce API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as SoqlResponse<SalesforceTask>;
  return data.records;
}
