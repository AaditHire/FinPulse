"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { message: "", ok: false };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);
  return (
    <form action={action} className="login-form">
      <label htmlFor="email">Owner email</label>
      <div className="login-input"><Mail size={16} /><input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></div>
      <button type="submit" disabled={pending}><ShieldCheck size={16} />{pending ? "Sending secure link…" : "Send magic link"}</button>
      {state.message ? <p className={state.ok ? "login-success" : "login-error"}>{state.message}</p> : null}
    </form>
  );
}
