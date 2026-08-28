import dotenv from "dotenv";
import { createClient } from "redis";
import path from "path";

dotenv.config({
  path: path.resolve(
    process.cwd(),
    "../.env"
  ),
});

const valkeyUrl = process.env.VALKEY_URL;

if (!valkeyUrl) {
  throw new Error("VALKEY_URL is not defined");
}

export const pubClient = createClient({
  url: valkeyUrl,
});

export const subClient = pubClient.duplicate();

/*
 * Valkey connection errors
 */
pubClient.on("error", (error) => {
  console.error("Valkey publisher error:", error);
});

subClient.on("error", (error) => {
  console.error("Valkey subscriber error:", error);
});

/*
 * Connection lifecycle logging
 */
pubClient.on("connect", () => {
  console.log("🔌 Valkey publisher connecting...");
});

pubClient.on("ready", () => {
  console.log("🟢 Valkey publisher ready");
});

subClient.on("connect", () => {
  console.log("🔌 Valkey subscriber connecting...");
});

subClient.on("ready", () => {
  console.log("🟢 Valkey subscriber ready");
});

export async function connectValkey() {
  if (!pubClient.isOpen) {
    await pubClient.connect();
  }

  if (!subClient.isOpen) {
    await subClient.connect();
  }

  console.log(
    "✓ Connected to Valkey"
  );
}