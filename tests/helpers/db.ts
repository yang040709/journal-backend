import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | undefined;
let connectPromise: Promise<void> | undefined;

function sanitizeProxyEnv() {
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
  ]) {
    const val = process.env[key]?.trim();
    if (!val) continue;
    if (!/^https?:\/\//i.test(val)) {
      delete process.env[key];
    }
  }
}

export async function connectTestDb() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (!connectPromise) {
    connectPromise = (async () => {
      sanitizeProxyEnv();
      let uri = process.env.MONGO_URI?.trim();
      if (!uri || uri.includes("journal-test-skipped")) {
        if (!mongod) {
          mongod = await MongoMemoryServer.create();
        }
        uri = mongod.getUri();
        process.env.MONGO_URI = uri;
      }
      await mongoose.connect(uri);
    })();
  }
  await connectPromise;
}

export async function clearTestDb() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
  connectPromise = undefined;
}
