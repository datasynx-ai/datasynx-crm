/**
 * Elicitation (N1-3): when a tool needs more input, return a structured request
 * (MCP elicitation shape) describing the fields to collect, instead of failing.
 * Helpers here build that request; wiring into specific tools (e.g. asking for a
 * deal stage) is incremental.
 */
export interface ElicitationField {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
}

export interface ElicitationRequest {
  message: string;
  requestedSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

/** Required keys that are absent, null, or empty-string in the input. */
export function missingFields(input: Record<string, unknown>, required: string[]): string[] {
  return required.filter((f) => {
    const v = input[f];
    return v === undefined || v === null || v === "";
  });
}

export function buildElicitation(message: string, fields: ElicitationField[]): ElicitationRequest {
  const properties: Record<string, { type: string; description?: string }> = {};
  for (const f of fields) {
    properties[f.name] = {
      type: f.type ?? "string",
      ...(f.description ? { description: f.description } : {}),
    };
  }
  return {
    message,
    requestedSchema: { type: "object", properties, required: fields.map((f) => f.name) },
  };
}
