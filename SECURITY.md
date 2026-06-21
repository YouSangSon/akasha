> **English** | [한국어](SECURITY.ko.md)

# Security policy

This document covers how to report a security vulnerability in
Akasha. For the threat model and in-place controls, see
[docs/security.md](docs/security.md).

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ |
| < 1.0   | ❌ |

## Reporting a vulnerability

**Don't open a public GitHub issue for security reports.** Public issues
disclose the vulnerability before a fix is available, putting all users
at risk.

Instead, send a private report to the maintainer:

- **GitHub Security Advisory** (preferred — encrypted, integrated with
  the patch workflow): open a private advisory at
  <https://github.com/YouSangSon/akasha/security/advisories/new>.
- DM the maintainer on the project's communication channel if one
  exists.

Include in your report:

- A clear description of the vulnerability
- Affected version (`git rev-parse HEAD` if you're on `main`)
- Steps to reproduce, ideally with a minimal proof-of-concept
- Impact assessment (what an attacker can do)
- Suggested mitigation if you have one

## Response process

1. **Acknowledgment**: within 72 hours of report.
2. **Initial assessment**: within 7 days — confirm reproducibility,
   classify severity (CVSS), and decide on a fix timeline.
3. **Fix development**: in a private branch / advisory.
4. **Coordinated disclosure**: once a fix is ready, we publish a
   patched release, document the issue in `CHANGELOG.md` under
   `Security`, and credit the reporter (if they agree).

For CRITICAL severity (RCE, data exfiltration, auth bypass), expect a
patched release within 7 days of confirmation. HIGH severity within
30 days. MEDIUM/LOW issues may be batched into a regular release.

## Out of scope

The following are **not** considered vulnerabilities for this project:

- Misconfigurations the user could have prevented by following
  [docs/security.md](docs/security.md) (e.g., empty
  `MEMORY_API_TOKENS` with `HOST=0.0.0.0` — the fail-closed gate
  refuses to start).
- Issues in third-party dependencies that we ship via npm — file those
  upstream.
- Denial of service via expensive queries: the project provides
  `RATE_LIMIT_PER_MINUTE` as a control; tune it for your deployment.
- Theoretical attacks requiring physical / privileged access to the
  host: see "Where the boundaries are" in
  [docs/security.md](docs/security.md).

## Scope

In scope:

- HTTP API (`src/app/`)
- MCP server (`src/mcp/`)
- Tool handlers and orchestrators (`src/compact/`, `src/store/`,
  `src/search/`, `src/audit/`)
- Migrations (`src/db/migrations/`)
- Bundled `compose.yaml` (default credentials, exposed ports)
- `install.sh` (privilege escalation, command injection in user input)

Out of scope (file with the upstream project):

- Postgres, Qdrant, OpenAI, Node.js core, npm packages

## Acknowledgments

Security researchers who report valid issues will be credited in the
release notes (with their consent). A hall-of-fame in this
`SECURITY.md` will list contributors as we go.
