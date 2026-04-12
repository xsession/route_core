# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public
GitHub issue. Instead, email the maintainers directly.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide an estimated timeline
for a fix.

## Scope

This framework is designed for **developer workstations and CI environments**.
It is not intended to be deployed as a network-facing service. Security issues
in the following areas are in scope:

- Code execution via crafted event log files
- Denial of service through resource exhaustion
- Dependency vulnerabilities

Out of scope:
- The framework's RNG is not cryptographically secure (by design)
- Test seeds are not secrets
