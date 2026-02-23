import { z } from "zod";

const FeishuModeSchema = z.enum(["websocket", "webhook"]);
const FeishuDomainSchema = z.enum(["feishu", "lark"]);

const baseSchema = z
  .object({
    FEISHU_DOMAIN: FeishuDomainSchema.default("feishu"),
    FEISHU_APP_ID: z.string().min(1, "FEISHU_APP_ID is required"),
    FEISHU_APP_SECRET: z.string().min(1, "FEISHU_APP_SECRET is required"),
    FEISHU_VERIFICATION_TOKEN: z.string().optional(),
    FEISHU_ENCRYPT_KEY: z.string().optional(),
    FEISHU_MODE: FeishuModeSchema.default("websocket"),
    PORT: z.coerce.number().int().positive().optional(),
    AGENT_ENDPOINT: z.string().url("AGENT_ENDPOINT must be a valid URL"),
  })
  .superRefine((value, ctx) => {
    if (value.FEISHU_MODE === "webhook" && !value.PORT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PORT"],
        message: "PORT is required when FEISHU_MODE=webhook",
      });
    }
  });

export type FeishuEnvContract = z.infer<typeof baseSchema>;

export function parseFeishuEnv(env: NodeJS.ProcessEnv = process.env): FeishuEnvContract {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "config";
      return `${path}: ${issue.message}`;
    });
    throw new Error(`Invalid Feishu integration configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function redactFeishuEnv(env: Partial<FeishuEnvContract>): Record<string, string> {
  const redact = (value?: string) => (value ? "***redacted***" : "<unset>");

  return {
    FEISHU_DOMAIN: env.FEISHU_DOMAIN ?? "<unset>",
    FEISHU_APP_ID: redact(env.FEISHU_APP_ID),
    FEISHU_APP_SECRET: redact(env.FEISHU_APP_SECRET),
    FEISHU_VERIFICATION_TOKEN: redact(env.FEISHU_VERIFICATION_TOKEN),
    FEISHU_ENCRYPT_KEY: redact(env.FEISHU_ENCRYPT_KEY),
    FEISHU_MODE: env.FEISHU_MODE ?? "<unset>",
    PORT: env.PORT ? String(env.PORT) : "<unset>",
    AGENT_ENDPOINT: env.AGENT_ENDPOINT ?? "<unset>",
  };
}
