import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const buildAuthToken = (): string => {
  const envToken = process.env.TEST_TOKEN;
  if (envToken) return envToken;

  const jwtSecret = process.env.JWT_SECRET;
  const userId = process.env.TEST_USER_ID || "upload_test_user";
  if (!jwtSecret) {
    throw new Error("请设置 TEST_TOKEN 或 JWT_SECRET");
  }
  return jwt.sign({ userId }, jwtSecret, { expiresIn: "2h" });
};

const expectBadRequest = async (
  apiBaseUrl: string,
  token: string,
  payload: Record<string, unknown>,
  caseName: string,
) => {
  try {
    await axios.post(`${apiBaseUrl}/api/upload/cos/sts`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Request-Id": `script_validate_${Date.now()}`,
      },
      timeout: 10_000,
    });
    console.log(`[FAIL] ${caseName} 预期 400，实际成功`);
    return false;
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      console.log(`[FAIL] ${caseName} 请求异常: ${(error as Error).message}`);
      return false;
    }
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    if (status === 400) {
      console.log(`[OK] ${caseName} 返回 400: ${message}`);
      return true;
    }
    console.log(`[FAIL] ${caseName} 预期 400，实际 ${status}: ${message}`);
    return false;
  }
};

async function main() {
  const apiBaseUrl = process.env.TEST_API_BASE_URL || "http://127.0.0.1:3000";
  const token = buildAuthToken();
  const maxFileSizeMb = Number(process.env.COS_MAX_FILE_SIZE_MB || "10");
  const overLimitSize = (maxFileSizeMb + 1) * 1024 * 1024;

  const results = await Promise.all([
    expectBadRequest(
      apiBaseUrl,
      token,
      {
        biz: "note",
        fileName: "bad-type.gif",
        fileType: "image/gif",
        fileSize: 1024,
      },
      "非法文件类型",
    ),
    expectBadRequest(
      apiBaseUrl,
      token,
      {
        biz: "note",
        fileName: "too-large.png",
        fileType: "image/png",
        fileSize: overLimitSize,
      },
      "超文件大小限制",
    ),
  ]);

  const allPassed = results.every(Boolean);
  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("测试脚本执行失败:", error.message);
  process.exit(1);
});
