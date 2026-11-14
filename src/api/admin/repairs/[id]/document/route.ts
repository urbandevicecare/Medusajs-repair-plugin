import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { generateRepairDocument } from "../../../../../utils/generate-repair-document";
import { REPAIR_MODULE } from "../../../../../modules/repair";
import RepairModuleService from "../../../../../modules/repair/service";
import { sanitizeRepairTicket } from "../../../../../utils/sanitize-ticket";

// GET /admin/repairs/:id/document?type=job_card | receipt | invoice | quote
export async function GET(
  req: MedusaRequest<{ id: string }>,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const type = (req.query.type as string) || "job_card";

  // Fetch ticket details
  const { data: tickets } = await query.graph({
    entity: "repair_ticket",
    fields: [
      "*",
      "device.*",
      "product_variants.*",
      "product_variants.prices.*",
    ],
    filters: { id: [req.params.id] },
  });

  if (!tickets || tickets.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Repair ticket not found",
    );
  }

  const ticket = tickets[0];

  // Try to map product_variants to parts for the template
  const parts = ticket.product_variants || [];

  // Try to find customer email/details
  let customerName = "Guest";
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
    } catch (e) {
      // ignore
    }
  }

  const payloadTicket = {
    ...sanitizeRepairTicket(ticket),
    parts,
  };

  await generateRepairDocument(type, payloadTicket, customerName, res, req);
}

// DELETE /admin/repairs/:id/document
// Deletes generated documents (including from Zoho Books if enabled) and resets metadata
export async function DELETE(
  req: MedusaRequest<{ id: string }>,
  res: MedusaResponse,
) {
  const { id } = req.params;
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  const logger = req.scope.resolve("logger");

  const tickets = await repairService.listRepairTickets({ id });
  if (!tickets || tickets.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Repair ticket not found",
    );
  }

  const ticket = tickets[0];
  const metadata = (ticket.metadata as Record<string, any>) || {};

  // 1. Delegate document and Zoho cleanup to medusajs-documents-plugin if present
  let handledByDocService = false;
  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService && typeof docService.deleteDocumentsForRepairTicket === "function") {
      await docService.deleteDocumentsForRepairTicket(id, req.scope);
      handledByDocService = true;
    } else if (docService) {
      const records = await docService.listDocumentRecords({ repair_ticket_id: id }).catch(() => []);
      for (const rec of records) {
        await docService.deleteDocumentRecords(rec.id).catch(() => {});
      }
    }
  } catch (docErr: any) {
    logger?.warn?.(`[Delete Documents] Error delegating cleanup to documents module: ${docErr.message}`);
  }

  // 2. Clear ticket document metadata
  const updatedMetadata = { ...metadata };
  delete updatedMetadata.zoho_estimate_id;
  delete updatedMetadata.zoho_invoice_id;
  delete updatedMetadata.zoho_payment_id;
  delete updatedMetadata.pdf_url;
  delete updatedMetadata.last_document_generated;
  delete updatedMetadata.job_card_id;
  delete updatedMetadata.job_card_created;

  const updatedTicket = await repairService.updateRepairTickets({
    id,
    metadata: updatedMetadata,
  });

  return res.json({
    success: true,
    message: "All generated documents have been deleted and cleared.",
    repair_ticket: sanitizeRepairTicket(updatedTicket),
  });
}
