import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  MedusaError,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

// GET /store/customers/me/repairs - Get all repairs for logged-in customer
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const logger = req.scope.resolve("logger");
  const customerId = req.auth_context?.actor_id;

  logger.debug(
    `[Store/Repairs] 🔍 Fetching repairs for customer: ${customerId || "Unauthenticated"}`,
  );

  if (!customerId) {
    logger.warn(
      `[Store/Repairs] ⚠️ Unauthorized access attempt to fetch customer repairs.`,
    );
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be logged in to view your repairs",
    );
  }

  try {
    // Find all repair tickets for this customer
    const { data: tickets } = await query.graph({
      entity: "repair_ticket",
      fields: ["*", "device.*", "media.*", "notes.*", "updates.*"],
      filters: { customer_id: customerId },
    });

    logger.debug(
      `[Store/Repairs] Found ${tickets.length} repair tickets for customer ${customerId}`,
    );

    // Filter out internal notes and sanitize numbers for customer view
    const formattedTickets = tickets.map((t: any) => {
      const ticket = sanitizeRepairTicket(t);
      return {
        ...ticket,
        notes: ticket.notes?.filter((note: any) => !note.is_internal) || [],
      };
    });

    res.json({
      repair_tickets: formattedTickets,
    });
  } catch (error: any) {
    logger.error(
      `[Store/Repairs] ❌ Failed to fetch repairs for customer ${customerId}`,
      error,
    );
    throw error;
  }
}
