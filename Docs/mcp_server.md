# MCP Server

The app exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp` (Streamable HTTP, stateless) so an MCP client such as Claude Code can operate it on your behalf: list and create parties, payment methods, projects and reminder schedules, draft, send and settle invoices, leave comments, and fetch a PDF. Design rationale lives in `Docs/implementation_decisions.md` §32.

## Connecting

1. Sign in as an `ADMIN`, open **Settings → API Tokens**, and create a token. Pick the smallest scope that fits:
   - **Read only** — lists and gets.
   - **Read + write** — also create, update, mark sent/paid, comments, reminders.
   - **Read + write + delete/void** — also the irreversible tools.
2. Copy the token when it is shown; it is never displayed again.
3. Add the server to Claude Code (the dialog shows this command pre-filled):

```bash
claude mcp add --transport http newinvoice https://<your-host>/api/mcp --header "Authorization: Bearer <token>"
```

Other clients that support Streamable HTTP with a static bearer header work the same way. Clients that require OAuth (for example ChatGPT connectors) are not supported yet.

## How calls are checked

A token acts as the user who created it, with that user's **current** role (demoting or deleting the user takes effect at once). Every call passes three gates in order, and every call — allowed, denied or failed — is written to the audit log with its tool, target and outcome:

1. **Scope** — the token's scope must cover the tool (`READ` < `WRITE` < `WRITE_DESTRUCTIVE`).
2. **Role** — the same table the app's own actions use: parties, payment methods, projects and reminder schedules need `ADMIN` or `STANDARD`; invoices, comments and clearing a reminder are open to every role.
3. **Business rules** — tools call the same services as the UI, so the sent-invoice lock, the status transition matrix, send validation, deletion blocks and so on apply unchanged; a rule violation comes back as a readable tool error, never a silent write.

Irreversible tools (`delete_*`, `void_invoice`) additionally require `confirm: true` on each call. Payment-method field values are always masked over MCP; full bank details are only visible in the app. Requests are rate-limited per token.

## Tools

| Area | Read | Write | Destructive |
| --- | --- | --- | --- |
| Projects (`ledger` param on `list_projects`, defaults to CLIENT) | `list_projects`, `get_project` | `create_project`, `update_project`, `archive_project`, `reorder_project` | `delete_project` |
| Parties | `list_parties`, `get_party` | `create_party`, `update_party` | `delete_party` |
| Payment methods | `list_payment_methods`, `get_payment_method` | `create_payment_method`, `update_payment_method`, `set_default_payment_method` | `delete_payment_method` |
| Invoices | `list_invoices`, `get_invoice`, `preview_next_invoice_number` | `create_draft_invoice`, `update_draft_invoice`, `mark_invoice_sent`, `mark_invoice_paid` | `void_invoice`, `delete_invoice` |
| Comments | `list_invoice_comments` | `add_invoice_comment`, `delete_invoice_comment` | — |
| Reminder schedules | `list_alert_schedules` | `create_alert_schedule`, `update_alert_schedule`, `clear_alert_schedule` | `delete_alert_schedule` |
| Documents | `get_invoice_pdf` | — | — |

Update tools take only the fields to change; everything else keeps its current value. `list_projects` and `list_invoices` default to the CLIENT ledger; pass `ledger: "INTERNAL"` for internal on-demand projects, and `create_project` accepts `ledger`. `create_draft_invoice` fills in the project's next invoice number when none is given, computed for the invoice's issue date. Dates are `yyyy-mm-dd`; money fields are decimal strings.
