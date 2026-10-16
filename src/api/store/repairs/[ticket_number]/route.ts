import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  MedusaError,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils";

// GET /store/repairs/:ticket_number - Track repair by ticket number
export async function GET(
  req: AuthenticatedMedusaRequest<{ ticket_number: string }>,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const ticketNumber = req.params.ticket_number;

  // Find the repair ticket by ticket_number
  const { data: tickets } = await query.graph({
    entity: "repair_ticket",
    fields: ["*", "device.*", "media.*", "notes.*", "updates.*"],
    filters: { ticket_number: ticketNumber },
  });

  if (!tickets || tickets.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Repair ticket with ticket number ${ticketNumber} not found`,
    );
  }

  const ticket = tickets[0];
  const customerId = req.auth_context?.actor_id;

  const isOwner = customerId && ticket.customer_id === customerId;

  if (isOwner) {
    // Authenticated owner gets the full payload, but we still filter out strictly internal notes
    const fullPayload = {
      ...ticket,
      notes: ticket.notes?.filter((note: any) => !note.is_internal) || [],
    };
    return res.json({ repair_ticket: fullPayload });
  }

  // Unauthenticated or not the owner - return a restricted public payload
  const publicPayload = {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    status: ticket.status,
    issue_description: ticket.issue_description,
    estimated_completion: ticket.estimated_completion,
    completed_at: ticket.completed_at,
    collected_at: ticket.collected_at,
    warranty_months: ticket.warranty_months,
    warranty_expiry: ticket.warranty_expiry,
    device: ticket.device ? {
      id: ticket.device.id,
      brand: ticket.device.brand,
      model_name: ticket.device.model_name,
    } : null,
    // Only return non-internal notes (public updates)
    notes: ticket.notes?.filter((note: any) => !note.is_internal) || [],
    updates: ticket.updates || [],
    // Do not return custom_parts, total_estimate, internal notes, technician_id, customer_id, etc.
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };

  res.json({
    repair_ticket: publicPayload,
  });
}
