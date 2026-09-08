import { serve } from "@hono/node-server";
import { Firestore } from "@google-cloud/firestore";
import { createApp } from "./app.js";
import { NearAnswerer } from "./answerer.js";
import { loadConfig } from "./config.js";
import { EmailLinkAuth } from "./email-auth.js";
import { GitHubRepository } from "./github-repository.js";
import { FirestoreIdentityStore } from "./identity-store.js";
import { Sentry } from "./instrumentation.js";
import { NearMaterializer } from "./materializer.js";

const config = loadConfig();
const firestore = new Firestore({ databaseId: config.firestoreDatabase });
const identities = new FirestoreIdentityStore(firestore);
const repository = new GitHubRepository(config.githubToken);
const materializer = new NearMaterializer(repository, config.githubToken);
const answerer = new NearAnswerer(config, materializer);
const app = createApp({
  config,
  identities,
  repository,
  answerer,
  emailAuth: new EmailLinkAuth(config, identities, firestore),
  serveWeb: true,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  Sentry.logger.info("near.gateway.started", { port: info.port, release: config.release });
});
