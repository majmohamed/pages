# Pages - Private HTML Hosting

Private HTML hosting on Azure App Service with per-file ACLs and Microsoft Entra authentication. Built by Maj Mohamed, based on [Dave Citron's Pages architecture](https://davecitron-pages.azurewebsites.net/).

**Live**: https://majid-pages.azurewebsites.net/

## What this is

A tiny Node.js app on Azure App Service that serves static HTML files where each file has its own access-control list of Microsoft corp email addresses. The owner can see every file; everyone else only sees files they're explicitly named in.

- Single Linux App Service, ~100 lines of server.js, no database
- Auth handled at the edge by Azure EasyAuth bound to a single-tenant Entra configuration
- No client secrets anywhere - auth uses a federated identity credential backed by a user-assigned managed identity
- Owner-only index page at `/` listing all hosted documents

## Security model (three layers)

| Layer | What it does |
|-------|-------------|
| **EasyAuth (edge)** | Azure App Service built-in auth, issuer pinned to Microsoft corp tenant. Non-Microsoft accounts rejected at the identity plane before Node runs |
| **Federated Identity Credential** | No client secrets. Entra app trusts a user-assigned managed identity attached to the App Service |
| **Per-file ACL** | server.js decodes `x-ms-client-principal`, checks against `acl.json`. Unlisted files are owner-only by default |

## Architecture

This setup differs from the standard single-tenant approach because the Azure subscription lives in a personal tenant (VS Enterprise FTE benefit), not the Microsoft corp tenant. The security is equivalent because EasyAuth's issuer validation is pinned to the corp tenant.

| Component | Location |
|-----------|----------|
| Azure subscription | Personal tenant |
| App Service (Linux B1, Node 22) | Personal subscription |
| Entra app registration | Personal tenant (multi-tenant) |
| Managed identity + FIC | Personal tenant (same-tenant, no policy blocks) |
| **EasyAuth issuer** | **Pinned to Microsoft corp tenant** |

See [azure-pages-setup.html](https://majid-pages.azurewebsites.net/azure-pages-setup.html) for the full writeup of how this was set up and why.

## Project structure

```
server.js              - Node.js server (~100 lines)
package.json           - Node 18+ dependency spec
acl.json               - Per-file access control list
index-registry.json    - Index page metadata (filename, title, date, access)
setup.ps1              - One-time Azure infrastructure setup
deploy.ps1             - Zip + deploy to App Service
public/
  index.html           - Owner-only homepage (auto-generated from registry)
  unauthorized.html    - 403 error page
  *.html               - Hosted documents
```

## ACL format

`acl.json` maps filenames to arrays of allowed corp emails:

```json
{
  "report.html": ["alice@microsoft.com", "bob@microsoft.com"],
  "dashboard.html": ["*@microsoft.com"]
}
```

- Files not listed are **owner-only**
- `*@microsoft.com` allows any authenticated Microsoft employee
- Emails are matched case-insensitively
- ACL is read on every request - edits take effect after deploy

## Deploy

```powershell
az login --use-device-code --tenant 238d1603-4924-455d-886d-68d1f9c8f90b
az account set --subscription 2c6beb98-88ee-4c64-bb6d-1c4f67dd5bd0
.\deploy.ps1
```

## Don't do this

- Don't add a directory listing route
- Don't add an unauthenticated `/health` endpoint
- Don't put behind a public CDN without preserving auth headers
- Don't add client secrets to the Entra app (the FIC model means nothing to leak)

## Credits

Architecture by Dave Citron. Adapted for personal tenant hosting by Maj Mohamed with Claude.
