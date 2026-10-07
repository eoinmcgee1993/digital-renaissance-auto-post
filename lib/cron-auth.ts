// Fail closed: without CRON_SECRET anyone could hit the cron routes and spend OpenAI credit.
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
