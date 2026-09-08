import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, api } from "./api.ts";

test("network failures use a stable Chinese message instead of browser copy", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await assert.rejects(
      api.courses(),
      (error) =>
        error instanceof ApiError &&
        error.code === "NETWORK_ERROR" &&
        error.status === 0 &&
        error.message === "网络连接失败，请检查网络，或确认服务已启动后重试。",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
