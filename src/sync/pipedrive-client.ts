export interface PipedrivePerson {
  id: number;
  name: string;
  primary_email?: string;
  org_name?: string;
  org_id?: { value: number };
}

export interface PipedriveActivity {
  id: number;
  type?: string;
  subject?: string;
  note?: string;
  due_date?: string;
  person_id?: number;
  org_id?: number;
}

interface PipedriveResponse<T> {
  data: T[];
  additional_data?: { pagination?: { more_items_in_collection?: boolean } };
}

async function pipedriveGet<T>(
  instanceUrl: string,
  token: string,
  path: string
): Promise<T[]> {
  const url = `${instanceUrl.replace(/\/$/, "")}/api/v1${path}?limit=500&api_token=${token}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Pipedrive API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as PipedriveResponse<T>;
  return data.data ?? [];
}

export async function fetchPipedrivePersons(
  instanceUrl: string,
  token: string
): Promise<PipedrivePerson[]> {
  return pipedriveGet<PipedrivePerson>(instanceUrl, token, "/persons");
}

export async function fetchPipedriveActivities(
  instanceUrl: string,
  token: string
): Promise<PipedriveActivity[]> {
  return pipedriveGet<PipedriveActivity>(instanceUrl, token, "/activities");
}

async function* pipedriveGetAll<T>(
  instanceUrl: string,
  token: string,
  endpoint: string
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "500", api_token: token });
    if (cursor) params.set("cursor", cursor);
    const url = `${instanceUrl.replace(/\/$/, "")}/api/v2${endpoint}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Pipedrive API error: ${res.status}`);
    const data = (await res.json()) as { data?: T[]; additional_data?: { next_cursor?: string } };
    for (const item of data.data ?? []) yield item;
    cursor = data.additional_data?.next_cursor;
  } while (cursor);
}

export async function fetchPipedrivePersonsAll(
  instanceUrl: string,
  token: string
): Promise<PipedrivePerson[]> {
  const result: PipedrivePerson[] = [];
  for await (const p of pipedriveGetAll<PipedrivePerson>(instanceUrl, token, "/persons")) {
    result.push(p);
  }
  return result;
}

export async function fetchPipedriveActivitiesAll(
  instanceUrl: string,
  token: string
): Promise<PipedriveActivity[]> {
  const result: PipedriveActivity[] = [];
  for await (const a of pipedriveGetAll<PipedriveActivity>(instanceUrl, token, "/activities")) {
    result.push(a);
  }
  return result;
}
