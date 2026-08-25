# Supabase free-project recovery

FinPulse sends a dedicated authenticated keep-alive every day. Normal ingestion is intentionally not the only source of database activity.

If Data Health reports that Supabase is unreachable:

1. Check the `FinPulse Supabase Keep Alive` workflow in GitHub Actions.
2. Open Supabase Studio and inspect the project status.
3. If the project is paused, choose **Restore project** and wait for the API health indicator to become green.
4. Run the keep-alive workflow manually and verify a successful `keepalive_events` insert.
5. Run `select public.database_size_report('<owner-user-id>');` from the SQL editor and check that utilization remains below 70%.
6. If utilization is 70% or greater, call `select public.prune_expired_data('<owner-user-id>');` and review the Data Health screen before restarting ingestion.

The keep-alive workflow requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_OWNER_ID`, and the existing SMTP secrets for failure mail.
