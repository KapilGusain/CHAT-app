import dotenv from "dotenv";
import { createClient } from "redis";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "../.env"),
}); 

const valkeyUrl = process.env.VALKEY_URL;

if (!valkeyUrl) {
  throw new Error("VALKEY_URL is not defined");
}

export const pubClient = createClient({
  url: valkeyUrl,
});

export const subClient = pubClient.duplicate();

pubClient.on("error", (error) => {
  console.error("Valkey publisher error:", error);
});

subClient.on("error", (error) => {
  console.error("Valkey subscriber error:", error);
});

export async function connectValkey() {
  if (!pubClient.isOpen) {
    await pubClient.connect();
  }

  if (!subClient.isOpen) {
    await subClient.connect();
  }

  console.log("Connected to Aiven Valkey");
}