# Connect a client to FinPulse

1. Sign into FinPulse with the owner email.
2. Open **MCP Access** in the sidebar.
3. Enter a key name, choose permissions and expiry, then select **Generate API key**.
4. Copy the key before selecting **Done — hide key**. FinPulse stores only its hash.
5. Configure your client with the displayed server URL, Streamable HTTP transport,
   and an Authorization header containing `Bearer YOUR_FINPULSE_API_KEY`.

For clients accepting an `mcpServers` configuration:

```json
{
  "mcpServers": {
    "finpulse": {
      "url": "https://YOUR_FINPULSE_HOST/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_FINPULSE_API_KEY"
      }
    }
  }
}
```

Client configuration formats vary. OAuth-only connectors do not support this key-based connection.

## Permissions

- market:read: quotes, macro series, provider health.
- research:read: document search and cited AI research.
- portfolio:read: holdings and portfolio risk.
- alerts:write: alert previews only; activation requires approval in FinPulse.

The server advertises only tools permitted by the presented key.
Revoke a key from the website to stop new requests immediately.
Expired and revoked keys cannot authenticate. Last-used timestamps update on successful authentication.

## Troubleshooting

- 401: sign in again for website operations; replace an invalid, expired, or revoked client key.
- 403: the requested permission or browser origin is not allowed.
- 503: configure Supabase URL, public key, and server-only service key.
- GET returning 405 is expected for older stateless MCP clients: initialize and invoke tools with POST.
- Do not put a Supabase service-role key into an MCP client. Use the generated `fp_` key.

## Verification

Run `npm test` and `npm run build` from the web directory. The MCP tests cover
initialization, scope-limited tool discovery, JWT/PAT authentication, expiry,
revocation, key hashing, and invalid inputs without using production credentials.
