import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { approveRepairCostWorkflow } from "../../../../../workflows/approve-repair-cost-workflow";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

// POST /admin/repairs/:id/approve - Manually approve repair cost and consent
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await approveRepairCostWorkflow(req.scope).run({
    input: {
      repair_ticket_id: req.params.id,
    },
  });

  res.json({
    repair_ticket: sanitizeRepairTicket(result.repairTicket),
    payment_collection: result.paymentCollection,
  });
}
