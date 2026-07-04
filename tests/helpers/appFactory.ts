import request from "supertest";
import app from "../../src/app";

/** 返回 supertest agent；不启动调度器（app 本身不含 scheduler） */
export function createTestAgent() {
  return request(app.callback());
}
