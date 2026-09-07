import { pool } from "@workspace/db";
import { logger } from "./logger";

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export async function ensureLeadsTable() {
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
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS service VARCHAR(80)`);
}

function formatTelegramMessage(lead: {
  name: string;
  company: string | null;
  businessDirection: string | null;
  service: string | null;
  phone: string;
  budget: string | null;
  task: string;
  createdAt: Date;
}) {
  const message = [
    "🔔 Новая заявка FlowIT",
    "",
    `👤 Имя: ${lead.name}`,
    `🏢 Компания: ${lead.company || "Не указана"}`,
    `📌 Направление: ${lead.businessDirection || "Не указано"}`,
    `🧭 Выбрано на сайте: ${lead.service || "Не указано"}`,
    `📱 Телефон: ${lead.phone}`,
    `💰 Бюджет: ${lead.budget || "Не указан"}`,
    `📝 Задача: ${lead.task}`,
    `🕐 Дата: ${lead.createdAt.toLocaleString("ru-RU", { timeZone: "Asia/Qyzylorda" })}`,
  ].join("\n");

  return message.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
}

export async function notifyTelegram(lead: {
  name: string;
  company: string | null;
  businessDirection: string | null;
  service: string | null;
  phone: string;
  budget: string | null;
  task: string;
  createdAt: Date;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.warn(
      "Telegram notification skipped because TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured",
    );
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramMessage(lead),
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram returned HTTP ${response.status}`);
  }
}