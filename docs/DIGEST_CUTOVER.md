# Python-to-TypeScript digest cutover

Do not enable both schedulers. Python owns delivery and sent-article history until every step below is complete.

1. Disable the schedule trigger in `.github/workflows/run-digest.yml` (or disable that workflow in GitHub Actions). Confirm no Python digest job is running.
2. Restore the latest `data/finpulse.db` workflow cache and export its history:
   `python -m agent.export_sent_history --database data/finpulse.db --output data/sent-history-export.json`
3. Import the export into the authenticated deployment:
   `curl -X POST -H "Authorization: Bearer $INTERNAL_API_SECRET" -H "Content-Type: application/json" --data-binary @data/sent-history-export.json "$FINPULSE_APP_URL/api/internal/cutover/import-history"`
4. Confirm the imported count and inspect `sent_articles`. Keep the JSON export as a private recovery artifact; it is ignored under `data/`.
5. Set Vercel `ENABLE_TS_DIGEST_SCHEDULER=true`. In GitHub, set the repository variable with the same name to `true`.
6. Run `FinPulse TypeScript Digest` manually once inside the approved delivery window. Confirm exactly one `delivery_items` row is `sent` and a second invocation reports that the window was already claimed.
7. Leave the Python workflow disabled. Roll back by setting both TypeScript flags to `false` before re-enabling Python.

The TypeScript scheduler sends research-only briefs, uses the scheduled Groq workload partition, and claims the unique `(channel, content_hash, scheduled_window)` key before model or email work.
