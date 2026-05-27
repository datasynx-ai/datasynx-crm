import type { CrmConnector, CrmContact, CrmActivity } from "./index.js";
import { RateLimiter } from "../../core/rate-limiter.js";

interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;
  };
}

interface HubSpotAssociation {
  toObjectId: number;
}

interface HubSpotActivityProperties {
  hs_note_body?: string;
  hs_call_body?: string;
  hs_email_subject?: string;
  hs_email_text?: string;
  hs_meeting_title?: string;
  hs_meeting_body?: string;
  hs_timestamp?: string;
  hs_call_duration?: string;
}

type HubSpotObjectType = "notes" | "calls" | "emails" | "meetings";

const limiter = new RateLimiter({ maxRetries: 4, baseDelayMs: 100 });

async function hubspotGet<T>(token: string, path: string): Promise<T> {
  return limiter.execute(async () => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) throw new Error("429 rate limit");
    if (!res.ok) throw new Error(`HubSpot API error: ${res.status}`);
    return res.json() as Promise<T>;
  });
}

async function* fetchContactsGen(token: string): AsyncGenerator<CrmContact> {
  let after: string | undefined;
  do {
    const params = new URLSearchParams({
      limit: "100",
      properties: "firstname,lastname,email,phone,company",
    });
    if (after) params.set("after", after);

    const data = await hubspotGet<{
      results: HubSpotContact[];
      paging?: { next?: { after?: string } };
    }>(token, `/crm/v3/objects/contacts?${params.toString()}`);

    for (const c of data.results) {
      const { firstname = "", lastname = "", email, phone, company } = c.properties;
      yield {
        id: c.id,
        name: `${firstname} ${lastname}`.trim() || "Unknown",
        email,
        phone,
        company,
      };
    }
    after = data.paging?.next?.after;
  } while (after);
}

const PROP_MAP: Record<HubSpotObjectType, string> = {
  notes: "hs_note_body,hs_timestamp",
  calls: "hs_call_body,hs_call_duration,hs_timestamp",
  emails: "hs_email_subject,hs_email_text,hs_timestamp",
  meetings: "hs_meeting_title,hs_meeting_body,hs_timestamp",
};

const TYPE_MAP: Record<HubSpotObjectType, CrmActivity["type"]> = {
  notes: "Note",
  calls: "Call",
  emails: "Email",
  meetings: "Meeting",
};

async function* fetchAssociatedActivities(
  token: string,
  contactId: string,
  objectType: HubSpotObjectType
): AsyncGenerator<CrmActivity> {
  let after: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const assocData = await hubspotGet<{
      results: HubSpotAssociation[];
      paging?: { next?: { after?: string } };
    }>(token, `/crm/v4/objects/contacts/${contactId}/associations/${objectType}?${params.toString()}`);

    for (const assoc of assocData.results) {
      const detail = await hubspotGet<{
        id: string;
        properties: HubSpotActivityProperties;
      }>(token, `/crm/v3/objects/${objectType}/${assoc.toObjectId}?properties=${PROP_MAP[objectType]}`);

      const props = detail.properties;
      const notes =
        props.hs_note_body ??
        props.hs_call_body ??
        props.hs_email_text ??
        props.hs_meeting_body;

      const subject = props.hs_email_subject ?? props.hs_meeting_title;

      yield {
        id: `hubspot-${objectType}-${detail.id}`,
        contactId,
        type: TYPE_MAP[objectType],
        subject,
        notes,
        date: props.hs_timestamp
          ? new Date(props.hs_timestamp).toISOString().slice(0, 10)
          : undefined,
      };
    }
    after = assocData.paging?.next?.after;
  } while (after);
}

export const HubSpotConnector: CrmConnector = {
  name: "HubSpot",

  async *fetchContacts(token: string, _instanceUrl: string): AsyncGenerator<CrmContact> {
    yield* fetchContactsGen(token);
  },

  async *fetchActivities(token: string, _instanceUrl: string): AsyncGenerator<CrmActivity> {
    for await (const contact of fetchContactsGen(token)) {
      for (const objectType of ["notes", "calls", "emails", "meetings"] as HubSpotObjectType[]) {
        yield* fetchAssociatedActivities(token, contact.id, objectType);
      }
    }
  },
};
