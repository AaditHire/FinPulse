"""Send an SMTP failure notification for the independent Supabase keep-alive workflow."""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def main() -> None:
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASS", "").strip()
    recipient = os.environ.get("EMAIL_TO", "").strip()
    detail = os.environ.get("KEEPALIVE_ERROR", "FinPulse could not reach Supabase.")
    if not (user and password and recipient):
        raise SystemExit("SMTP_USER, SMTP_PASS and EMAIL_TO are required for keep-alive failure mail")
    message = EmailMessage()
    message["Subject"] = "FinPulse: Supabase keep-alive failed"
    message["From"] = user
    message["To"] = recipient
    message.set_content(f"{detail}\n\nOpen Supabase Studio and follow docs/SUPABASE_RECOVERY.md.")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
        smtp.login(user, password)
        smtp.send_message(message)


if __name__ == "__main__":
    main()
