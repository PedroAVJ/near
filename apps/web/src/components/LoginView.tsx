import { CheckCircle2, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { completeEmailLink, requestEmailLink } from "../api";
import { captureClientError } from "../analytics";
import type { Profile } from "../types";
import { Brand } from "./Brand";

interface LoginViewProps {
  oobCode?: string;
  onSignedIn(profile: Profile): void;
}

const storedEmailKey = "near:emailForSignIn";

export function LoginView({ oobCode, onSignedIn }: LoginViewProps) {
  const [email, setEmail] = useState(() => localStorage.getItem(storedEmailKey) ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setBusy(true);
    setError("");
    try {
      if (oobCode) {
        const { profile } = await completeEmailLink(normalized, oobCode);
        localStorage.removeItem(storedEmailKey);
        history.replaceState({}, "", "/");
        onSignedIn(profile);
      } else {
        localStorage.setItem(storedEmailKey, normalized);
        await requestEmailLink(normalized);
        setSent(true);
      }
    } catch (caught) {
      captureClientError(caught, oobCode ? "email_complete" : "email_start");
      setError(caught instanceof Error ? caught.message : "Near could not complete sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <header className="login-shell__brand"><Brand /></header>
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">{oobCode ? "Finish signing in" : "Welcome to Near"}</h1>
        <p>{oobCode ? "Confirm the invited email for this sign-in link." : "Enter your invited email. We’ll send you a secure sign-in link."}</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="email">Email</label>
          <div className="email-field">
            <Mail aria-hidden="true" size={22} />
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Please wait…" : oobCode ? "Continue to Near" : "Email me a sign-in link"}
          </button>
        </form>
        {sent ? <p className="form-success"><CheckCircle2 aria-hidden="true" size={20} />Check your email for the sign-in link.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <p className="login-card__foot">No password required.</p>
      </section>
    </main>
  );
}
