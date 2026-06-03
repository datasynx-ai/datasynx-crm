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

export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  StageName?: string;
  Amount?: number | null;
  CloseDate?: string;
  Probability?: number | null;
  Account?: { Name?: string; Website?: string };
}

interface SoqlResponse<T> {
  records: T[];
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
}

/**
 * Run a SOQL query and return ALL records, following Salesforce's
 * `nextRecordsUrl` so large orgs are imported completely (no LIMIT cap).
 */
async function soqlQueryAll<T>(instanceUrl: string, token: string, soql: string): Promise<T[]> {
  let url: string | null = `${instanceUrl}/services/data/v58.0/query?q=${soql}`;
  const all: T[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Salesforce API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as SoqlResponse<T>;
    all.push(...data.records);
    url = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null;
  }

  return all;
}

export async function fetchSalesforceContacts(
  instanceUrl: string,
  token: string
): Promise<SalesforceContact[]> {
  return soqlQueryAll<SalesforceContact>(
    instanceUrl,
    token,
    "SELECT+Id,Name,Email,Account.Website+FROM+Contact"
  );
}

export async function fetchSalesforceTasks(
  instanceUrl: string,
  token: string
): Promise<SalesforceTask[]> {
  return soqlQueryAll<SalesforceTask>(
    instanceUrl,
    token,
    "SELECT+Id,Subject,Description,ActivityDate,Type,WhoId+FROM+Task"
  );
}

export async function fetchSalesforceOpportunities(
  instanceUrl: string,
  token: string
): Promise<SalesforceOpportunity[]> {
  return soqlQueryAll<SalesforceOpportunity>(
    instanceUrl,
    token,
    "SELECT+Id,Name,StageName,Amount,CloseDate,Probability,Account.Name,Account.Website+FROM+Opportunity"
  );
}

export interface SalesforceBulkJobStatus {
  id: string;
  state: "Open" | "UploadComplete" | "InProgress" | "JobComplete" | "Failed" | "Aborted";
}

export async function createBulkJob(
  instanceUrl: string,
  token: string,
  soql: string
): Promise<string> {
  const url = `${instanceUrl}/services/data/v58.0/jobs/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operation: "query", query: soql }),
  });
  if (!res.ok) throw new Error(`Salesforce Bulk API error: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function pollBulkJob(
  instanceUrl: string,
  token: string,
  jobId: string
): Promise<SalesforceBulkJobStatus> {
  const url = `${instanceUrl}/services/data/v58.0/jobs/query/${jobId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Salesforce Bulk poll error: ${res.status}`);
  return (await res.json()) as SalesforceBulkJobStatus;
}

export async function* fetchBulkResults(
  instanceUrl: string,
  token: string,
  jobId: string
): AsyncGenerator<string> {
  let locator: string | undefined;

  do {
    const url = locator
      ? `${instanceUrl}/services/data/v58.0/jobs/query/${jobId}/results?locator=${locator}`
      : `${instanceUrl}/services/data/v58.0/jobs/query/${jobId}/results`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Salesforce Bulk results error: ${res.status}`);

    const csv = await res.text();
    yield csv;

    const nextLocator = res.headers.get("Sforce-Locator");
    locator = nextLocator === "null" || !nextLocator ? undefined : nextLocator;
  } while (locator);
}
