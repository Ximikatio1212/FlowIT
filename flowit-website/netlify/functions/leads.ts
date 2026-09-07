import { CreateLeadBody } from "@workspace/api-zod";

type NetlifyEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type LeadRecord = {
  id: number;
  name: string;
  company: string | null;
  businessDirection: string | null;
  service: string | null;
  phone: string;
  task: string;
  budget: string | null;
  status: string;
  createdAt: Date;
};

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestCounts = new Map<string, { count: number; resetAt: number }>();
let tableReady = false;

function response(statusCode: number, body: unknown) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clientKey(event: NetlifyEvent) {
  return (
    event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function allowedByRateLimit(event: NetlifyEvent) {
  const now = Date.now();
  const key = clientKey(event);
  const current = requestCounts.get(key);

  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

async function ensureTable(pool: { query: (text: string) => Promise<unknown> }) {
  if (tableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      company VARCHAR(160),
      business_direction VARCHAR(160),
      service VARCHAR(80),
      phone VARCHAR(40) NOT NULL,
      task TEXT NOT NULL,
      budget VARCHAR(80),
      status VARCHAR(24) NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS service VARCHAR(80)",
  );
  tableReady = true;
}

function telegramText(lead: LeadRecord) {
  return [
    "🔔 Новая заявка FlowIT",
    "",
    `👤 Имя: ${lead.name}`,
    `🏢 Компания: ${lead.company || "Не указана"}`,
    `📌 Направление: ${lead.businessDirection || "Не указано"}`,
    `🧭 Выбрано на сайте: ${lead.service || "Не указано"}`,
    `📱 Телефон: ${lead.phone}`,
    `💰 Бюджет: ${lead.budget || "Не указан"}`,
    `📝 Задача: ${lead.task}`,
    `🕐 Дата: ${lead.createdAt.toLocaleString("ru-RU", {
      timeZone: "Asia/Qyzylorda",
    })}`,
  ]
    .join("\n")
    .slice(0, 4096);
}

async function notifyTelegram(lead: LeadRecord) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
    );
  }

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: telegramText(lead),
        disable_web_page_preview: true,
      }),
    },
  );

  if (!telegramResponse.ok) {
    throw new Error(`Telegram returned HTTP ${telegramResponse.status}`);
  }
}

async function saveLeadIfDatabaseConfigured(
  input: ReturnType<typeof CreateLeadBody.parse>,
) {
  if (!process.env.DATABASE_URL) return null;

  try {
    const { db, leadsTable, pool } = await import("@workspace/db");
    await ensureTable(pool);

    const [lead] = await db
      .insert(leadsTable)
      .values({
        name: input.name.trim(),
        company: input.company?.trim() || null,
        businessDirection: input.business_direction?.trim() || null,
        service: input.service?.trim() || null,
        phone: input.phone.trim(),
        task: input.task.trim(),
        budget: input.budget?.trim() || null,
      })
      .returning();

    return lead;
  } catch (error) {
    console.warn(
      "Database is unavailable; continuing with Telegram delivery only",
      error,
    );
    return null;
  }
}

export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, {});
  }

  if (event.httpMethod !== "POST") {
    return response(405, { error: "Метод не поддерживается." });
  }

  if (!allowedByRateLimit(event)) {
    return response(429, {
      error: "Слишком много заявок. Попробуйте через минуту.",
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, {
      error: "Проверьте заполнение обязательных полей заявки.",
    });
  }

  const parsed = CreateLeadBody.safeParse(body);
  if (!parsed.success) {
    return response(400, {
      error: "Проверьте заполнение обязательных полей заявки.",
    });
  }

  if (parsed.data.honeypot?.trim()) {
    return response(400, { error: "Не удалось отправить заявку." });
  }

  try {
    const input = parsed.data;
    const savedLead = await saveLeadIfDatabaseConfigured(input);
    const lead: LeadRecord = savedLead ?? {
      id: 0,
      name: input.name.trim(),
      company: input.company?.trim() || null,
      businessDirection: input.business_direction?.trim() || null,
      service: input.service?.trim() || null,
      phone: input.phone.trim(),
      task: input.task.trim(),
      budget: input.budget?.trim() || null,
      status: "new",
      createdAt: new Date(),
    };

    await notifyTelegram(lead);

    return response(201, {
      id: lead.id,
      name: lead.name,
      company: lead.company,
      business_direction: lead.businessDirection,
      service: lead.service,
      phone: lead.phone,
      task: lead.task,
      budget: lead.budget,
      status: lead.status,
      created_at: lead.createdAt.toISOString(),
      storage: savedLead ? "database_and_telegram" : "telegram",
    });
  } catch (error) {
    console.error("Lead could not be saved", error);
    return response(500, {
      error: "Не удалось сохранить заявку. Попробуйте ещё раз.",
    });
  }
}