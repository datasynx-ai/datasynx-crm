# Security Policy

We take the security of DatasynxOpenCRM (`@datasynx/agentic-crm`) seriously.
Because the product is **local-first** — all customer data lives in Markdown
files on the operator's own machine — the most sensitive surfaces are the
credential vault, the MCP server, and the optional team HTTP server.

## Supported Versions

Security fixes are released for the latest published `0.x` minor line. We
recommend always running the most recent version:

```bash
npm install -g @datasynx/agentic-crm@latest
```

| Version | Supported |
|---------|-----------|
| latest `0.x` | ✅ |
| older | ❌ (please upgrade) |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report privately through either channel:

1. **GitHub Private Vulnerability Reporting** (preferred) —
   <https://github.com/datasynx/datasynx-crm/security/advisories/new>
2. **Email** — `eng@datasynx.io` with subject `SECURITY: <summary>`

Please include:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version(s) and environment

### Our commitment

| Stage | Target |
|-------|--------|
| Acknowledgement | within **2 business days** |
| Triage & severity assessment | within **5 business days** |
| Fix or mitigation plan | communicated after triage |
| Public disclosure | coordinated with the reporter after a fix ships |

We will credit reporters in the release notes unless you ask to remain
anonymous. We do not currently operate a paid bug-bounty program.

## Security Model & Hardening

DatasynxOpenCRM is designed to keep data under the operator's control:

- **Local-first storage** — no third-party cloud holds your customer data.
- **Encrypted vault** — credentials are stored with AES-256-GCM (`dxcrm vault`).
- **RBAC** — tool/customer access is enforced via the `DXCRM_ACTOR` identity
  and `.agentic/rbac.json` (`dxcrm rbac`).
- **Audit trail** — every write operation is append-only logged (`dxcrm audit`).
- **GDPR erasure** — `dxcrm gdpr erase <slug>` performs verifiable deletion.
- **Supply-chain** — CI runs dependency audit, license checks, a deprecated-
  transitive guard (`check:deps`) and a native install-script allowlist guard
  (`check:install-scripts`), and publishes with npm **provenance** attestation
  and an SBOM (CycloneDX).

For an enterprise security questionnaire response, run:

```bash
dxcrm security-report
```

## Handling Secrets

Never commit tokens, OAuth credentials, or `.agentic/` contents. The repo's
`.gitignore` excludes runtime data directories; treat any leaked token as
compromised and rotate it immediately.
