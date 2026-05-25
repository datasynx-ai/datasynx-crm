# Data Schemas — DatasynxOpenCRM

All schemas are validated with Zod v3.

---

## main_facts.md (Customer Profile)

YAML frontmatter in `customers/<slug>/main_facts.md`:

```yaml
---
name: "Acme Corp"
domain: "acme.com"                    # optional
email: "ceo@acme.com"                 # optional
phone: "+49 123 456789"               # optional
industry: "Software"                  # optional
relationship_stage: "active"          # prospect|active|churned|paused
deal_value: 50000                     # optional, number
currency: "EUR"                       # default: EUR
primary_contact: "Max Müller"         # optional
timezone: "Europe/Berlin"             # optional
tags: ["key-account", "renewal"]      # default: []
created: "2026-01-15"                 # YYYY-MM-DD
updated: "2026-05-25"                 # YYYY-MM-DD
---
# Acme Corp

Free-form notes about the customer go here.
```

---

## interactions.md (Interaction History)

`customers/<slug>/interactions.md` — newest entry first:

```markdown
## 2026-05-25 · Call · outbound
**With:** Max Müller
**Summary:** Discussed Q3 renewal. Budget confirmed at €50k. Decision expected by end of June.
**Next Steps:**
- [ ] Send proposal by Friday
- [ ] Schedule follow-up for June 15
**Source:** manual
**Synced:** 2026-05-25T10:30:00.000Z
---

## 2026-05-20 · Email · inbound
**With:** max@acme.com
**Summary:** Max requested an updated pricing sheet for the Q3 renewal.
**Next Steps:**
- [ ] Prepare pricing sheet
**Source:** gmail://thread/abc123def456
**Synced:** 2026-05-20T14:00:00.000Z
---
```

**Types:** Email · Call · Meeting · Note · Demo · Proposal · Contract · Other
**Directions:** inbound · outbound (optional)

---

## pipeline.md (Deal Tracking)

`customers/<slug>/pipeline.md` — markdown table:

```markdown
# Pipeline — Acme Corp

| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes |
|---|---|---|---|---|---|---|---|
| Q3 Renewal | negotiation | 50000 | EUR | 75 | 2026-08-31 | 2026-05-25 | Budget confirmed |
| Upsell Module X | proposal | 15000 | EUR | 40 | 2026-10-01 | 2026-05-20 | Evaluating |
```

**Stages:** lead · qualified · proposal · negotiation · won · lost

---

## sources.json (Sync Configuration)

`customers/<slug>/sources.json`:

```json
{
  "gmail": {
    "query": "from:acme.com OR to:acme.com",
    "enabled": true
  },
  "transcripts": {
    "paths": ["/Users/user/Downloads/Fireflies"],
    "extensions": [".txt", ".vtt"],
    "enabled": true
  }
}
```

Global sources in `.agentic/sources.json` follow the same schema.
