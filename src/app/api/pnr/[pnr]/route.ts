import { NextRequest } from "next/server";
import { z } from "zod";
import { isValidPnr } from "@/lib/engine";
import { serverSyntheticSource } from "@/lib/server-source";
import { pnrCache, CACHE_TTLS } from "@/lib/cache";
import { clientIp, createRateLimiter, PNR_RATE_LIMIT } from "@/lib/ratelimit";
import { AppError, fromSourceCode, toApiError } from "@/lib/errors";

const limiter = createRateLimiter();

const pnrParam = z.string().refine(isValidPnr, {
  message: "A PNR is 10 digits and never starts with 0 or 1.",
});

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ pnr: string }> }
) {
  const started = Date.now();
  try {
    const { pnr } = await ctx.params;
    const parsed = pnrParam.safeParse(pnr);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid PNR");
    }

    const xff = _req.headers.get("x-forwarded-for");
    const ip = clientIp(null, xff);
    const rate = await limiter.check(`pnr:${ip}`, PNR_RATE_LIMIT.limit, PNR_RATE_LIMIT.windowMs);
    if (!rate.ok) {
      throw new AppError("RATE_LIMITED", "Too many checks from this address. Wait and retry.", {
        retryAfter: rate.retryAfterSeconds,
      });
    }

    const cacheKey = `pnr:${pnr}`;
    let cached = pnrCache.get<ReturnType<typeof fromOk>>(cacheKey);
    let fromCache = true;
    if (!cached) {
      const out = await serverSyntheticSource.check(pnr, []);
      if (!out.ok) throw fromSourceCode(out.code, out.message);
      cached = fromOk(out.result);
      pnrCache.set(cacheKey, cached, CACHE_TTLS.snapshot);
      fromCache = false;
    }

    const latencyMs = Date.now() - started;
    return Response.json(
      {
        ok: true,
        cached: fromCache,
        source: "demo",
        latencyMs,
        rate: { remaining: rate.remaining, limit: PNR_RATE_LIMIT.limit },
        data: cached,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (err) {
    const body = toApiError(err);
    const status =
      body.code === "INVALID_INPUT"
        ? 400
        : body.code === "NOT_FOUND"
          ? 404
          : body.code === "RATE_LIMITED"
            ? 429
            : body.code === "SOURCE_UNAVAILABLE"
              ? 503
              : 500;
    return Response.json(body, {
      status,
      headers: body.retryAfter
        ? { "Retry-After": String(body.retryAfter), "X-Content-Type-Options": "nosniff" }
        : { "X-Content-Type-Options": "nosniff" },
    });
  }
}

// Serialisable, cache-safe projection of a result.
function fromOk(result: import("@/lib/types").PnrResult) {
  return {
    pnr: result.snapshot.pnr,
    train: {
      number: result.snapshot.train.number,
      name: result.snapshot.train.name,
      from: result.snapshot.train.from.code,
      to: result.snapshot.train.to.code,
      depTime: result.snapshot.train.depTime,
    },
    cls: result.snapshot.cls,
    journeyDate: result.snapshot.journeyDate,
    journeyDateLabel: result.snapshot.journeyDateLabel,
    chartTime: result.snapshot.chartTime,
    chartAt: result.snapshot.chartAt,
    lead: result.lead,
    prediction: result.prediction,
    trend: result.trend,
    hoursToChart: result.hoursToChart,
    checkedAt: result.checkedAt,
  };
}