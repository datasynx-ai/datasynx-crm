export interface SalesforceContact {
  Id: string;
  Name: string;
  Email?: string;
  OwnerId?: string;
  Account?: { Website?: string };
}

export interface SalesforceTask {
  Id: string;
  Subject?: string;
  Description?: string;
  ActivityDate?: string;
  Type?: string;
  WhoId?: string;
  OwnerId?: string;
}

export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  StageName?: string;
  Amount?: number | null;
  CloseDate?: string;
  Probability?: number | null;
  OwnerId?: string;
  Account?: { Name?: string; Website?: string };
}

export interface SalesforceLead {
  Id: string;
  Name: string;
  Company?: string;
  Email?: string;
  Title?: string;
  Phone?: string;
  Status?: string;
  Website?: string;
  OwnerId?: string;
}

/** A Salesforce User — the basis for Owner → Actor mapping. */
export interface SalesforceUser {
  Id: string;
  Name?: string;
  Email?: string;
  IsActive?: boolean;
}

/** A Salesforce Account, including its parent for account-hierarchy mapping. */
export interface SalesforceAccount {
  Id: string;
  Name?: string;
  ParentId?: string;
  Website?: string;
  OwnerId?: string;
}

/** One field entry from an sObject `describe` call. */
export interface SalesforceFieldDescribe {
  name: string;
  label?: string;
  type?: string;
  custom?: boolean;
}

/** A classic Salesforce Attachment (binary blob attached to a record). */
export interface SalesforceAttachment {
  Id: string;
  Name?: string;
  ParentId?: string;
  ContentType?: string;
  BodyLength?: number;
}

export interface SalesforceCampaignMember {
  Id: string;
  CampaignId?: string;
  Campaign?: { Name?: string };
  ContactId?: string;
  LeadId?: string;
  Status?: string;
  CreatedDate?: string;
}

export interface SalesforceNote {
  Id: string;
  Title?: string;
  Body?: string;
  ParentId?: string;
  CreatedDate?: string;
}

export interface SalesforceLineItem {
  Id: string;
  OpportunityId?: string;
  Quantity?: number | null;
  UnitPrice?: number | null;
  TotalPrice?: number | null;
  Description?: string;
  Product2?: { Name?: string };
}

export interface SalesforceCase {
  Id: string;
  CaseNumber?: string;
  Subject?: string;
  Description?: string;
  Status?: string;
  Priority?: string;
  Account?: { Name?: string };
  AccountId?: string;
  ContactId?: string;
  CreatedDate?: string;
  ClosedDate?: string;
  OwnerId?: string;
}

export interface SalesforceEvent {
  Id: string;
  Subject?: string;
  Description?: string;
  ActivityDate?: string;
  StartDateTime?: string;
  WhoId?: string;
  WhatId?: string;
  OwnerId?: string;
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
    "SELECT+Id,Name,Email,OwnerId,Account.Website+FROM+Contact"
  );
}

export async function fetchSalesforceTasks(
  instanceUrl: string,
  token: string
): Promise<SalesforceTask[]> {
  return soqlQueryAll<SalesforceTask>(
    instanceUrl,
    token,
    "SELECT+Id,Subject,Description,ActivityDate,Type,WhoId,OwnerId+FROM+Task"
  );
}

export async function fetchSalesforceOpportunities(
  instanceUrl: string,
  token: string
): Promise<SalesforceOpportunity[]> {
  return soqlQueryAll<SalesforceOpportunity>(
    instanceUrl,
    token,
    "SELECT+Id,Name,StageName,Amount,CloseDate,Probability,OwnerId,Account.Name,Account.Website+FROM+Opportunity"
  );
}

export async function fetchSalesforceLeads(
  instanceUrl: string,
  token: string
): Promise<SalesforceLead[]> {
  return soqlQueryAll<SalesforceLead>(
    instanceUrl,
    token,
    "SELECT+Id,Name,Company,Email,Title,Phone,Status,Website,OwnerId+FROM+Lead"
  );
}

export async function fetchSalesforceEvents(
  instanceUrl: string,
  token: string
): Promise<SalesforceEvent[]> {
  return soqlQueryAll<SalesforceEvent>(
    instanceUrl,
    token,
    "SELECT+Id,Subject,Description,ActivityDate,StartDateTime,WhoId,WhatId,OwnerId+FROM+Event"
  );
}

export async function fetchSalesforceCases(
  instanceUrl: string,
  token: string
): Promise<SalesforceCase[]> {
  return soqlQueryAll<SalesforceCase>(
    instanceUrl,
    token,
    "SELECT+Id,CaseNumber,Subject,Description,Status,Priority,Account.Name,AccountId,ContactId,CreatedDate,ClosedDate,OwnerId+FROM+Case"
  );
}

export async function fetchSalesforceLineItems(
  instanceUrl: string,
  token: string
): Promise<SalesforceLineItem[]> {
  return soqlQueryAll<SalesforceLineItem>(
    instanceUrl,
    token,
    "SELECT+Id,OpportunityId,Quantity,UnitPrice,TotalPrice,Description,Product2.Name+FROM+OpportunityLineItem"
  );
}

export async function fetchSalesforceNotes(
  instanceUrl: string,
  token: string
): Promise<SalesforceNote[]> {
  return soqlQueryAll<SalesforceNote>(
    instanceUrl,
    token,
    "SELECT+Id,Title,Body,ParentId,CreatedDate+FROM+Note"
  );
}

export async function fetchSalesforceCampaignMembers(
  instanceUrl: string,
  token: string
): Promise<SalesforceCampaignMember[]> {
  return soqlQueryAll<SalesforceCampaignMember>(
    instanceUrl,
    token,
    "SELECT+Id,CampaignId,Campaign.Name,ContactId,LeadId,Status,CreatedDate+FROM+CampaignMember"
  );
}

/**
 * Fetch all Salesforce Users. The basis for Owner → Actor mapping: every
 * record's `OwnerId` is resolved against this list to attribute the imported
 * activity/deal to the responsible rep.
 */
export async function fetchSalesforceUsers(
  instanceUrl: string,
  token: string
): Promise<SalesforceUser[]> {
  return soqlQueryAll<SalesforceUser>(
    instanceUrl,
    token,
    "SELECT+Id,Name,Email,IsActive+FROM+User"
  );
}

/**
 * Fetch all Salesforce Accounts including `ParentId`, so parent/subsidiary
 * account hierarchies can be reconstructed in the imported CRM.
 */
export async function fetchSalesforceAccounts(
  instanceUrl: string,
  token: string
): Promise<SalesforceAccount[]> {
  return soqlQueryAll<SalesforceAccount>(
    instanceUrl,
    token,
    "SELECT+Id,Name,ParentId,Website,OwnerId+FROM+Account"
  );
}

/**
 * Run the sObject `describe` REST call and return its field metadata. This is
 * the API-side equivalent of inspecting an export's columns: it discovers
 * custom fields (`__c`) on any object without hard-coding them.
 */
export async function describeSalesforceObject(
  instanceUrl: string,
  token: string,
  objectName: string
): Promise<SalesforceFieldDescribe[]> {
  const url = `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/describe`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Salesforce API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { fields?: SalesforceFieldDescribe[] };
  return data.fields ?? [];
}

/**
 * Convenience wrapper over {@link describeSalesforceObject} that returns only
 * the custom fields (those flagged `custom: true`, i.e. ending in `__c`).
 */
export async function fetchSalesforceCustomFields(
  instanceUrl: string,
  token: string,
  objectName: string
): Promise<SalesforceFieldDescribe[]> {
  const fields = await describeSalesforceObject(instanceUrl, token, objectName);
  return fields.filter((f) => f.custom === true);
}

/**
 * Run an ad-hoc SOQL `SELECT <fields> FROM <object>` and return all records
 * (with pagination). Used to pull discovered custom-field values once their
 * API names are known from a `describe` call.
 */
export async function fetchSalesforceRecords(
  instanceUrl: string,
  token: string,
  objectName: string,
  fields: string[]
): Promise<Array<Record<string, unknown>>> {
  const soql = `SELECT+${fields.join(",")}+FROM+${objectName}`;
  return soqlQueryAll<Record<string, unknown>>(instanceUrl, token, soql);
}

/**
 * Fetch all classic Salesforce Attachment records (metadata only — the binary
 * body is downloaded separately via {@link downloadSalesforceAttachment}).
 */
export async function fetchSalesforceAttachments(
  instanceUrl: string,
  token: string
): Promise<SalesforceAttachment[]> {
  return soqlQueryAll<SalesforceAttachment>(
    instanceUrl,
    token,
    "SELECT+Id,Name,ParentId,ContentType,BodyLength+FROM+Attachment"
  );
}

/**
 * Download the binary body of a single Attachment and return it as a Buffer.
 */
export async function downloadSalesforceAttachment(
  instanceUrl: string,
  token: string,
  attachmentId: string
): Promise<Buffer> {
  const url = `${instanceUrl}/services/data/v58.0/sobjects/Attachment/${attachmentId}/Body`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Salesforce API error: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
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
