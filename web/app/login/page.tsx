import { ChartNoAxesCombined, LockKeyhole } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><ChartNoAxesCombined size={26} /><span>FinPulse</span></div>
        <LockKeyhole className="login-mark" size={35} />
        <h1>Private market intelligence.</h1>
        <p>Your portfolio, research corpus, alerts and agent history are protected by owner-only authentication.</p>
        <LoginForm />
        <small>Research only. FinPulse never connects to trading endpoints or places orders.</small>
      </section>
    </main>
  );
}
