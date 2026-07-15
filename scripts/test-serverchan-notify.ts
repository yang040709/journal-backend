/**
 * Server酱 Turbo 推送连通性测试
 *
 * 用法（在 backend 目录）:
 *   npx tsx scripts/test-serverchan-notify.ts
 *   npx tsx scripts/test-serverchan-notify.ts --dry-run   # 仅检查配置，不发送
 *   npx tsx scripts/test-serverchan-notify.ts --login       # 模拟管理员登录通知
 */
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import {
  getServerChanChannel,
  getServerChanSendKey,
  isServerChanAdminLoginEnabled,
  isServerChanAdminLoginNotifyEnabled,
  isServerChanConfigured,
  isServerChanNotifyEnabled,
} from "../src/config/serverChanEnv";
import { ServerChanNotifyService } from "../src/service/serverChanNotify.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SENDKEY_PATTERN = /^SCT[A-Za-z0-9]{8,128}$/;

function maskSendKey(key: string): string {
  if (!key) return "(未设置)";
  if (key.length <= 8) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function printConfigDiagnostics(): void {
  const rawSendKey = String(process.env.SERVERCHAN_SENDKEY ?? "").trim();
  const parsedSendKey = getServerChanSendKey();

  console.log("\n=== Server酱 配置诊断 ===");
  console.log(`SERVERCHAN_SENDKEY (原始): ${maskSendKey(rawSendKey)}`);
  if (rawSendKey && !parsedSendKey) {
    console.log("  ⚠ SendKey 格式无效，须匹配 /^SCT[A-Za-z0-9]{8,128}$/");
    console.log(`  当前长度: ${rawSendKey.length}`);
  } else if (parsedSendKey) {
    console.log("  ✓ SendKey 格式有效");
  }
  console.log(`SERVERCHAN_NOTIFY_ENABLED: ${process.env.SERVERCHAN_NOTIFY_ENABLED ?? "(未设置)"}`);
  console.log(`SERVERCHAN_NOTIFY_ADMIN_LOGIN: ${process.env.SERVERCHAN_NOTIFY_ADMIN_LOGIN ?? "(未设置，默认 true)"}`);
  console.log(`SERVERCHAN_CHANNEL: ${process.env.SERVERCHAN_CHANNEL?.trim() || "(未设置)"}`);
  console.log("");
  console.log(`isServerChanNotifyEnabled: ${isServerChanNotifyEnabled()}`);
  console.log(`isServerChanAdminLoginNotifyEnabled: ${isServerChanAdminLoginNotifyEnabled()}`);
  console.log(`isServerChanConfigured: ${isServerChanConfigured()}`);
  console.log(`isServerChanAdminLoginEnabled: ${isServerChanAdminLoginEnabled()}`);
  console.log(`ServerChanNotifyService.isAdminLoginEnabled: ${ServerChanNotifyService.isAdminLoginEnabled()}`);
}

async function sendDirectTest(title: string, desp: string): Promise<boolean> {
  const sendKey = getServerChanSendKey();
  if (!sendKey) {
    console.error("\n✗ 无法发送：SendKey 未配置或格式无效");
    return false;
  }

  const body: Record<string, string> = { title, desp };
  const channel = getServerChanChannel();
  if (channel) body.channel = channel;

  const url = `https://sctapi.ftqq.com/${sendKey}.send`;
  console.log(`\n=== 直连 API 测试 ===`);
  console.log(`POST ${url.replace(sendKey, maskSendKey(sendKey))}`);
  if (channel) console.log(`channel: ${channel}`);

  try {
    const res = await axios.post(url, body, {
      timeout: 15000,
      headers: { "Content-Type": "application/json;charset=utf-8" },
    });

    console.log("响应:", JSON.stringify(res.data, null, 2));

    if (res.data?.code === 0) {
      console.log("\n✓ Server酱 推送成功");
      if (res.data?.data?.pushid) {
        console.log(`  pushid: ${res.data.data.pushid}`);
      }
      return true;
    }

    console.error(`\n✗ Server酱 返回错误 code=${res.data?.code}, message=${res.data?.message ?? "(无)"}`);
    return false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ 请求异常: ${msg}`);
    if (axios.isAxiosError(error) && error.response) {
      console.error("HTTP 状态:", error.response.status);
      console.error("响应体:", JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function testViaService(): Promise<boolean> {
  console.log("\n=== 通过 ServerChanNotifyService 测试（模拟登录通知）===");

  if (!ServerChanNotifyService.isAdminLoginEnabled()) {
    console.error("✗ 服务层判定未启用，不会发送（见上方配置诊断）");
    return false;
  }

  const before = Date.now();
  await ServerChanNotifyService.notifyAdminLogin({
    username: "test-script",
    ip: "127.0.0.1",
    at: new Date(),
  });
  const elapsed = Date.now() - before;

  console.log(`notifyAdminLogin 已调用（${elapsed}ms，fire-and-forget 不抛异常）`);
  console.log("若上方直连 API 成功但登录仍无通知，请检查运行中的 backend 进程是否加载了相同 .env");
  return true;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const loginMode = args.includes("--login");

  console.log("Server酱 Turbo 测试脚本");
  printConfigDiagnostics();

  if (dryRun) {
    console.log("\n--dry-run：跳过实际发送");
    process.exit(isServerChanConfigured() && isServerChanNotifyEnabled() ? 0 : 1);
  }

  const title = loginMode
    ? "Journal 管理后台登录提醒"
    : "Journal Server酱 连通性测试";
  const desp = loginMode
    ? [
        "**账号**：test-script",
        "",
        `**时间**：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        "",
        "**IP**：127.0.0.1",
        "",
        "如非本人操作，请立即修改密码。",
      ].join("\n")
    : [
        "**测试类型**：连通性探测",
        "",
        `**时间**：${new Date().toISOString()}`,
        "",
        "收到此消息说明 Server酱 配置正常。",
      ].join("\n");

  const directOk = await sendDirectTest(title, desp);

  if (loginMode) {
    await testViaService();
  }

  process.exit(directOk ? 0 : 1);
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
