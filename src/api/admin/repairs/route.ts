import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createRepairTicketWorkflow } from "../../../workflows/create-repair-ticket-workflow";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { sanitizeRepairTicket } from "../../../utils/sanitize-ticket";

// GET /admin/repairs - List all repair tickets
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const filters: any = req.filterableFields || {};
  if (req.query.customer_id) {
    filters.customer_id = req.query.customer_id;
  }
  if (req.query.status && req.query.status !== "all") {
    filters.status = req.query.status;
  }

  // Cap the rows at 100 per request
  const requestedLimit = Number(req.query.limit) || req.queryConfig?.pagination?.take || 100;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  const offset = Number(req.query.offset) || req.queryConfig?.pagination?.skip || 0;

  const { data, metadata } = await query.graph({
    entity: "repair_ticket",
    fields: ["*", "device.*", "media.*", "notes.*", "updates.*"],
    filters: filters,
    pagination: {
      ...req.queryConfig?.pagination,
      take: limit,
      skip: offset,
      order: req.queryConfig?.pagination?.order || { created_at: "DESC" },
    },
  });

  const sanitizedTickets = Array.isArray(data) ? data.map(sanitizeRepairTicket) : [];

  res.json({
    repair_tickets: sanitizedTickets,
    count: metadata?.count ?? data.length,
    offset,
    limit,
    ...metadata,
  });
}

// POST /admin/repairs - Create a new repair ticket
export async function POST(
  req: MedusaRequest<{
    device: any;
    ticket: any;
  }>,
  res: MedusaResponse,
) {
  const { device, ticket } = req.validatedBody;

  const { result } = await createRepairTicketWorkflow(req.scope).run({
    input: {
      device,
      ticket,
    },
  });

  res.json({
    repair_ticket: result.repairTicket,
    device: result.device,
  });
}
