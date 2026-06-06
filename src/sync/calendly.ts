export interface CalendlyEventType {
  uri: string;
  slug: string;
  name: string;
  duration: number;
  schedulingUrl: string;
  active: boolean;
}

interface CalendlyApiEventType {
  uri: string;
  slug: string;
  name: string;
  duration: number;
  scheduling_url: string;
  active: boolean;
}

async function calendlyRequest<T>(apiKey: string, path: string): Promise<T> {
  const { default: https } = await import("https");
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.calendly.com${path}`,
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Invalid JSON from Calendly API: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getCurrentUserUri(apiKey: string): Promise<string> {
  const resp = await calendlyRequest<{ resource: { uri: string } }>(apiKey, "/users/me");
  return resp.resource.uri;
}

export async function listEventTypes(apiKey: string): Promise<CalendlyEventType[]> {
  const userUri = await getCurrentUserUri(apiKey);
  const encoded = encodeURIComponent(userUri);
  const resp = await calendlyRequest<{ collection: CalendlyApiEventType[] }>(
    apiKey,
    `/event_types?user=${encoded}&active=true`
  );
  return resp.collection.map((et) => ({
    uri: et.uri,
    slug: et.slug,
    name: et.name,
    duration: et.duration,
    schedulingUrl: et.scheduling_url,
    active: et.active,
  }));
}

export async function getSchedulingLink(
  apiKey: string,
  eventTypeSlug: string,
  prefill?: { name?: string; email?: string }
): Promise<string> {
  const eventTypes = await listEventTypes(apiKey);
  const eventType = eventTypes.find(
    (et) => et.slug === eventTypeSlug || et.name.toLowerCase().includes(eventTypeSlug.toLowerCase())
  );
  if (!eventType) {
    throw new Error(`Event type '${eventTypeSlug}' not found in Calendly`);
  }
  let url = eventType.schedulingUrl;
  const params = new URLSearchParams();
  if (prefill?.name) params.set("name", prefill.name);
  if (prefill?.email) params.set("email", prefill.email);
  if (params.toString()) url += `?${params.toString()}`;
  return url;
}
