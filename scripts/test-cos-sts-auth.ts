import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiBaseUrl = process.env.TEST_API_BASE_URL || "http://127.0.0.1:3000";

  try {
    await axios.post(
      `${apiBaseUrl}/api/upload/cos/sts`,
      {
        biz: "note",
        fileName: "auth-check.png",
        fileType: "image/png",
        fileSize: 1024,
      },
      {
        headers: {
          "X-Request-Id": `script_auth_${Date.now()}`,
        },
        timeout: 10_000,
      },
    );
    console.log("[FAIL] 未携带 token 仍然请求成功");
    process.exitCode = 1;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      if (status === 401) {
        console.log(`[OK] 鉴权校验通过，返回 401: ${message}`);
        return;
      }
      console.log(`[FAIL] 预期 401，实际 ${status}: ${message}`);
      process.exitCode = 1;
      return;
    }

    console.log(`[FAIL] 请求异常: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("测试脚本执行失败:", error.message);
  process.exit(1);
});
