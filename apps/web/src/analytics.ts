import type * as SentryType from "@sentry/react";
import type PostHog from "posthog-js";
import type { Profile, RuntimeConfig } from "./types";

let posthog: typeof PostHog | undefined;
let sentry: typeof SentryType | undefined;

export async function initializeTelemetry(config: RuntimeConfig): Promise<void> {
  const initializers: Array<Promise<void>> = [];
  if (config.sentryDsn) {
    initializers.push(import("@sentry/react").then((loaded) => {
      loaded.init({
        dsn: config.sentryDsn,
        environment: "production",
        release: config.release,
        enableLogs: true,
        sendDefaultPii: false,
        tracesSampleRate: 0.05,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeSend(event) {
          if (event.request) {
            delete event.request.cookies;
            delete event.request.data;
            delete event.request.headers;
            delete event.request.query_string;
          }
          return event;
        },
      });
      sentry = loaded;
    }));
  }

  if (config.posthogKey) {
    initializers.push(import("posthog-js").then(({ default: loaded }) => {
      loaded.init(config.posthogKey!, {
        api_host: config.posthogHost ?? "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: "localStorage+cookie",
        person_profiles: "identified_only",
      });
      posthog = loaded;
    }));
  }
  await Promise.all(initializers);
}

export function identifyUser(profile: Profile): void {
  posthog?.identify(profile.id, { near_tenant: profile.id });
  sentry?.setUser({ id: profile.id });
}

export function resetIdentity(): void {
  posthog?.reset();
  sentry?.setUser(null);
}

export function captureProductEvent(
  name: "signed_in" | "signed_out" | "conversation_started" | "message_sent" | "response_received" | "voice_started",
  properties: Record<string, string | number | boolean> = {},
): void {
  posthog?.capture(name, properties);
  sentry?.logger.info(`near.web.${name}`, properties);
}

export function captureClientError(error: unknown, operation: string): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    scope.setTag("near.operation", operation);
    sentry?.captureException(error);
  });
}
