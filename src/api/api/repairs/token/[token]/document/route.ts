import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { generateRepairDocument } from "../../../../../../utils/generate-repair-document";

// GET /api/repairs/token/:token/document?type=invoice | quote | receipt (Direct/Proxy route)
export async function GET(
  req: MedusaRequest<{ token: string }>,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const type = (req.query.type as string) || "invoice";

  // Fetch ticket details by approval_token, id, or ticket_number
  const rawToken = req.params.token;
  let { data: tickets } = await query.graph({
    entity: "repair_ticket",
    fields: [
      "*",
      "device.*",
      "product_variants.*",
      "product_variants.prices.*",
    ],
    filters: { approval_token: rawToken },
  });

  if (!tickets || tickets.length === 0) {
    const fallbackRes = await query.graph({
      entity: "repair_ticket",
      fields: [
        "*",
        "device.*",
        "product_variants.*",
        "product_variants.prices.*",
      ],
      filters: !isNaN(Number(rawToken)) ? { ticket_number: Number(rawToken) } : { id: rawToken },
    }).catch(() => ({ data: [] }));
    tickets = fallbackRes.data;
  }

  if (!tickets || tickets.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Repair ticket not found or invalid token",
    );
  }

  const ticket = tickets[0];
  const parts = ticket.product_variants || [];

  let customerName = "Customer";
  if (ticket.customer_id) {
    try {
      const customerModule = req.scope.resolve("customer", {
        allowUnregistered: true,
      });
      if (customerModule) {
        const customer = await customerModule.retrieveCustomer(
          ticket.customer_id,
        );
        if (customer) {
          customerName = customer.first_name
            ? `${customer.first_name} ${customer.last_name || ""}`
            : customer.email || "Customer";
        }
      }
    } catch (e) {}
  }

  const payloadTicket = { ...ticket, parts };
  await generateRepairDocument(type, payloadTicket, customerName, res, req);
}
