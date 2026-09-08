import * as Sentry from "@sentry/node";

const dsn = process.env.NEAR_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  release: process.env.NEAR_RELEASE ?? "near@development",
  enableLogs: true,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.headers;
      delete event.request.query_string;
    }
    return event;
  },
  beforeSendLog(log) {
    delete log.attributes?.email;
    delete log.attributes?.message;
    delete log.attributes?.path;
    return log;
  },
});

export { Sentry };
