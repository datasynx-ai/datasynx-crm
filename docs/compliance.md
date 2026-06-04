# Compliance & Privacy

Datasynx Agentic CRM is built local-first, which makes most data-protection questions
easy to answer: your CRM data lives in plain Markdown on your own disk. This page
covers the governance features that make it defensible in a regulated context
(EU AI Act, GDPR/DSGVO) — all introduced in domino **D17**.

## EU AI Act — Article 50 (transparency)

Any content generated with an LLM (e.g. an AI-polished `draft_email` body) is
labelled with a transparency disclosure so recipients know AI was involved.

- **On by default.** Opt out with `DXCRM_AI_DISCLOSURE=off`.
- **Localized.** `DXCRM_AI_DISCLOSURE_LANG=de|en` (default `de`).
- Disclosure text: *"Hinweis: Dieser Inhalt wurde mithilfe von KI erstellt (EU-AI-Act Art. 50)."*

```bash
dxcrm compliance            # show the active posture (provider, disclosure, PII, guardrails)
```

## Local-LLM option (data-residency moat)

`callLlm` is provider-agnostic. Point it at a self-hosted, OpenAI-compatible
endpoint (e.g. Ollama) and **no customer data leaves the machine** — a strong
privacy guarantee for sensitive deployments.

```bash
export DXCRM_LLM_PROVIDER=ollama                 # anthropic (default) | ollama | openai | local
export DXCRM_LLM_BASE_URL=http://127.0.0.1:11434/v1
export DXCRM_LLM_MODEL=llama3.1
```

The provider runtime itself (the model, inference) is the agent framework's job;
the package only resolves and exposes the configuration and routes the call.

## Privacy controls

| Control | Env var | Default | Effect |
|---|---|---|---|
| PII masking | `DXCRM_PII_MASKING=on` | off | Masks emails/phones before any LLM call, restores after |
| Prompt guardrails | `DXCRM_GUARDRAILS=on` | off | Neutralizes prompt-injection in untrusted text |
| AI disclosure | `DXCRM_AI_DISCLOSURE=off` | on | EU AI Act Art. 50 labelling of generated content |

## GDPR / DSGVO

- **Right to erasure (Art. 17):** `dxcrm gdpr erase <slug>` removes a customer's data.
- **DPIA / FRIA:** because data is local Markdown and the LLM can run on-prem, a
  Data-Protection Impact Assessment is straightforward — document the data flows
  (local files → optional local/Anthropic LLM), the legal basis, and the controls
  in the table above. A Fundamental-Rights Impact Assessment (FRIA) is relevant if
  you deploy this in a high-risk context under the AI Act; the Art. 50 labelling
  and human-in-the-loop approval gate (D4) are the primary mitigations.

## Human-in-the-loop

The approval gate (D4, `dxcrm policy` / `dxcrm approvals`) lets you require human
sign-off for any agent action, so automated steps never run unsupervised when you
don't want them to.
