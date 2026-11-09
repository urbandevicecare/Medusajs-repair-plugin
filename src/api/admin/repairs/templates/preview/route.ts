import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// GET /admin/repairs/templates/preview - Redirect to centralized documents plugin preview
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const queryStr = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return res.redirect(`/admin/documents/templates/preview${queryStr}`);
}
