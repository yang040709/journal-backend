import axios from "axios";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import COS from "cos-nodejs-sdk-v5";

dotenv.config();

// 某些本地环境会注入代理变量，导致 COS SDK 走隧道失败。
// 测试脚本默认关闭代理，确保直连腾讯云 COS。
if (process.env.TEST_DISABLE_PROXY !== "false") {
  process.env.HTTP_PROXY = "";
  process.env.HTTPS_PROXY = "";
  process.env.ALL_PROXY = "";
  process.env.http_proxy = "";
  process.env.https_proxy = "";
  process.env.all_proxy = "";
}

type AllowedMimeType = "image/jpeg" | "image/png" | "image/webp";

interface LocalImage {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: AllowedMimeType;
}

interface StsData {
  bucket: string;
  region: string;
  key: string;
  expiredTime: number;
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  uploadHost: string;
  fileUrl: string;
}

const getMimeTypeByExt = (fileName: string): AllowedMimeType | null => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
};

const buildAuthToken = (): string => {
  if (process.env.TEST_TOKEN) return process.env.TEST_TOKEN;
  if (!process.env.JWT_SECRET) {
    throw new Error("请设置 TEST_TOKEN 或 JWT_SECRET");
  }
  const userId = process.env.TEST_USER_ID || "upload_test_user";
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "2h" });
};

const readImages = async (dir: string): Promise<LocalImage[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: LocalImage[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileType = getMimeTypeByExt(entry.name);
    if (!fileType) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.stat(filePath);
    result.push({
      fileName: entry.name,
      filePath,
      fileSize: stat.size,
      fileType,
    });
  }
  return result;
};

const requestSts = async (
  apiBaseUrl: string,
  token: string,
  image: LocalImage,
): Promise<StsData> => {
  const resp = await axios.post(
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
        "X-Request-Id": `script_upload_real_${Date.now()}_${image.fileName}`,
      },
      timeout: 10000,
    },
  );

  return resp.data.data as StsData;
};

const uploadToCos = async (image: LocalImage, sts: StsData): Promise<string> => {
  const buffer = await fs.readFile(image.filePath);
  const cos = new COS({
    SecretId: sts.tmpSecretId,
    SecretKey: sts.tmpSecretKey,
    SecurityToken: sts.sessionToken,
  });

  return await new Promise<string>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: sts.bucket,
        Region: sts.region,
        Key: sts.key,
        Body: buffer,
        ContentType: image.fileType,
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data.ETag || "");
      },
    );
  });
};

async function main() {
  const apiBaseUrl = process.env.TEST_API_BASE_URL || "http://127.0.0.1:3000";
  const imagesDir = process.env.TEST_IMAGES_DIR || path.resolve(process.cwd(), "../tmp");
  const token = buildAuthToken();
  const images = await readImages(imagesDir);

  if (!images.length) {
    throw new Error(`未找到可上传图片: ${imagesDir}`);
  }

  console.log(`上传目标服务: ${apiBaseUrl}`);
  console.log(`上传图片目录: ${imagesDir}`);
  console.log(`开始上传: ${images.length} 张`);

  let ok = 0;
  for (const image of images) {
    try {
      const sts = await requestSts(apiBaseUrl, token, image);
      const etag = await uploadToCos(image, sts);
      ok += 1;
      console.log(
        `[OK] ${image.fileName}\n  key=${sts.key}\n  fileUrl=${sts.fileUrl}\n  etag=${etag}\n  expiredTime=${sts.expiredTime}`,
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log(
          `[FAIL] ${image.fileName} -> STS请求失败 status=${error.response?.status}, message=${error.response?.data?.message || error.message}`,
        );
      } else {
        console.log(`[FAIL] ${image.fileName} -> ${(error as Error).message}`);
      }
    }
  }

  console.log(`上传完成: ${ok}/${images.length} 成功`);
  if (ok !== images.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("脚本执行失败:", error.message);
  process.exit(1);
});
