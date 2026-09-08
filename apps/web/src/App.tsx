import { useEffect, useMemo, useState } from "react";
import { ApiError, getSession } from "./api";
import { captureClientError, captureProductEvent, identifyUser } from "./analytics";
import { ChatApp } from "./components/ChatApp";
import { LoginView } from "./components/LoginView";
import type { Profile } from "./types";

export function App() {
  const [profile, setProfile] = useState<Profile>();
  const [loading, setLoading] = useState(true);
  const oobCode = useMemo(() => new URLSearchParams(location.search).get("oobCode") ?? undefined, []);

  useEffect(() => {
    if (oobCode) {
      setLoading(false);
      return;
    }
    getSession()
      .then(({ profile: current }) => {
        setProfile(current);
        identifyUser(current);
      })
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) captureClientError(error, "session_bootstrap");
      })
      .finally(() => setLoading(false));
  }, [oobCode]);

  if (loading) return <div className="boot-screen"><img src="/near-icon.svg" alt="Near" /></div>;
  if (!profile) {
    return <LoginView oobCode={oobCode} onSignedIn={(signedIn) => {
      setProfile(signedIn);
      identifyUser(signedIn);
      captureProductEvent("signed_in");
    }} />;
  }
  return <ChatApp profile={profile} onLoggedOut={() => setProfile(undefined)} />;
}
