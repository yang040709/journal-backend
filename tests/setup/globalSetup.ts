import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | undefined;

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

export async function setup() {
  sanitizeProxyEnv();
  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
  } catch (error) {
    console.warn(
      "[tests] MongoMemoryServer 启动失败:",
      error instanceof Error ? error.message : error,
    );
    process.env.MONGO_URI =
      process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/journal-test-skipped";
  }
}

export async function teardown() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongod?.stop();
  mongod = undefined;
}
