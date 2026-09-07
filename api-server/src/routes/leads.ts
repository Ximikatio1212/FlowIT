import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { CreateLeadBody } from "@workspace/api-zod";
import { db, leadsTable } from "@workspace/db";
import { notifyTelegram } from "../lib/leads";

const router: IRouter = Router();

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = requestCounts.get(key);

  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: "Слишком много заявок. Попробуйте через минуту." });
    return;
  }

  current.count += 1;
  next();
}

router.post("/leads", rateLimit, async (req, res) => {
  const parsed = CreateLeadBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте заполнение обязательных полей заявки." });
    return;
  }

  const input = parsed.data;
  if (input.honeypot?.trim()) {
    res.status(400).json({ error: "Не удалось отправить заявку." });
    return;
  }

  try {
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

    try {
      await notifyTelegram({
        name: lead.name,
        company: lead.company,
        businessDirection: lead.businessDirection,
        service: lead.service,
        phone: lead.phone,
        budget: lead.budget,
        task: lead.task,
        createdAt: lead.createdAt,
      });
    } catch (error) {
      req.log.warn({ err: error, leadId: lead.id }, "Telegram notification failed after lead save");
    }

    res.status(201).json({
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
    });
  } catch (error) {
    req.log.error({ err: error }, "Lead could not be saved");
    res.status(500).json({ error: "Не удалось сохранить заявку. Попробуйте ещё раз." });
  }
});

export default router;