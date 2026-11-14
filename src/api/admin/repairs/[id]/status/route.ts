import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updateRepairStatusWorkflow } from "../../../../../workflows/update-repair-status-workflow";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

// POST /admin/repairs/:id/status - Update repair status
export async function POST(
  req: MedusaRequest<{
    status:
      | "received"
      | "diagnosing"
      | "awaiting_approval"
      | "repairing"
      | "ready"
      | "completed"
      | "cancelled";
    estimated_completion?: string;
    previous_status?: string;
  }>,
  res: MedusaResponse,
) {
  const { status, estimated_completion, previous_status } = req.validatedBody;

  const { result } = await updateRepairStatusWorkflow(req.scope).run({
    input: {
      repair_ticket_id: req.params.id,
      status,
      estimated_completion: estimated_completion
        ? new Date(estimated_completion)
        : undefined,
      previous_status,
    },
  });

  res.json({
    repair_ticket: sanitizeRepairTicket(result.repairTicket),
  });
}
