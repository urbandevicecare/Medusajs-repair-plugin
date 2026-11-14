import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { toggleRepairTaxWorkflow } from "../../../../../workflows/toggle-repair-tax-workflow";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

export async function POST(
  req: MedusaRequest<{ apply_tax: boolean }>,
  res: MedusaResponse
) {
  const { apply_tax } = req.body;

  const { result } = await toggleRepairTaxWorkflow(req.scope).run({
    input: {
      repair_ticket_id: req.params.id,
      apply_tax,
    },
  });

  res.json({ repair_ticket: sanitizeRepairTicket(result) });
}
