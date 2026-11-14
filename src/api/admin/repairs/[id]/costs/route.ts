import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { updateRepairCostsStep } from "../../../../../workflows/steps/update-repair-costs";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

const updateRepairCostsWorkflow = createWorkflow(
  "update-repair-costs-workflow",
  function (input: {
    repair_ticket_id: string;
    parts_estimate?: number;
    labor_estimate?: number;
    parts_actual?: number;
    labor_actual?: number;
  }) {
    const updatedTicket = updateRepairCostsStep(input);
    return new WorkflowResponse({ repairTicket: updatedTicket });
  },
);

// POST /admin/repairs/:id/costs - Update repair costs
export async function POST(
  req: MedusaRequest<{
    parts_estimate?: number;
    labor_estimate?: number;
    parts_actual?: number;
    labor_actual?: number;
  }>,
  res: MedusaResponse,
) {
  const { parts_estimate, labor_estimate, parts_actual, labor_actual } =
    req.validatedBody;

  const { result } = await updateRepairCostsWorkflow(req.scope).run({
    input: {
      repair_ticket_id: req.params.id,
      parts_estimate,
      labor_estimate,
      parts_actual,
      labor_actual,
    },
  });

  res.json({
    repair_ticket: sanitizeRepairTicket(result.repairTicket),
  });
}
