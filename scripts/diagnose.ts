import { parseFeishuEnv, redactFeishuEnv } from "../src/env-contract.js";
import { probeFeishu } from "../src/probe.js";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();

  let env;
  try {
    env = parseFeishuEnv(process.env);
  } catch (error) {
    console.error("[diagnose] configuration validation failed");
    console.error(String(error));
    process.exitCode = 1;
    return;
  }

  console.log("[diagnose] started:", startedAt);
  console.log("[diagnose] mode:", env.FEISHU_MODE);
  console.log("[diagnose] domain:", env.FEISHU_DOMAIN);
  console.log("[diagnose] config (redacted):");
  console.log(JSON.stringify(redactFeishuEnv(env), null, 2));

  const probe = await probeFeishu({
    appId: env.FEISHU_APP_ID,
    appSecret: env.FEISHU_APP_SECRET,
    domain: env.FEISHU_DOMAIN,
  });

  console.log("[diagnose] token/auth:", probe.ok ? "ok" : "failed");
  console.log("[diagnose] bot identity:", probe.botName ?? "unknown", probe.botOpenId ?? "unknown");
  if (!probe.ok) {
    console.error("[diagnose] probe error:", probe.error ?? "unknown error");
    process.exitCode = 1;
  }
}

void main();
