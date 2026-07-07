import axios from "axios";
import path from "path";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

type AllowedMimeType = "image/jpeg" | "image/png" | "image/webp";

interface TestImage {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: AllowedMimeType;
}

const getMimeTypeByExt = (fileName: string): AllowedMimeType | null => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
};

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

const readTestImages = async (targetDir: string): Promise<TestImage[]> => {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());

  const images: TestImage[] = [];
  for (const file of files) {
    const fileType = getMimeTypeByExt(file.name);
    if (!fileType) continue;

    const filePath = path.join(targetDir, file.name);
    const stat = await fs.stat(filePath);
    images.push({
      fileName: file.name,
      filePath,
      fileSize: stat.size,
      fileType,
    });
  }
  return images;
};

async function main() {
  const apiBaseUrl = process.env.TEST_API_BASE_URL || "http://127.0.0.1:3000";
  const imagesDir =
    process.env.TEST_IMAGES_DIR ||
    path.resolve(process.cwd(), "../tmp");

  const token = buildAuthToken();
  const images = await readTestImages(imagesDir);

  if (!images.length) {
    throw new Error(`未在目录找到可测试图片: ${imagesDir}`);
  }

  console.log(`测试服务: ${apiBaseUrl}`);
  console.log(`测试图片目录: ${imagesDir}`);
  console.log(`待测图片数量: ${images.length}`);

  let successCount = 0;
  for (const image of images) {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/api/upload/cos/sts`,
        {
          biz: "note",
          fileName: image.fileName,
          fileType: image.fileType,
          fileSize: image.fileSize,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Request-Id": `script_${Date.now()}_${image.fileName}`,
          },
          timeout: 10_000,
        },
      );

      const data = response.data?.data || {};
      successCount += 1;
      console.log(
        `[OK] ${image.fileName} -> key=${data.key}, expiredTime=${data.expiredTime}`,
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const body = error.response?.data;
        console.log(
          `[FAIL] ${image.fileName} -> status=${error.response?.status}, message=${body?.message || error.message}`,
        );
      } else {
        console.log(`[FAIL] ${image.fileName} -> ${(error as Error).message}`);
      }
    }
  }

  console.log(`完成: ${successCount}/${images.length} 成功`);
  if (successCount !== images.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("测试脚本执行失败:", error.message);
  process.exit(1);
});
