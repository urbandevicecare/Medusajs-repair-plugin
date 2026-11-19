import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  MedusaError,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils";
import { sanitizeRepairTicket } from "../../../../utils/sanitize-ticket";
import { REPAIR_MODULE } from "../../../../modules/repair";
import RepairModuleService from "../../../../modules/repair/service";

// GET /admin/repairs/:id - Get single repair ticket
export async function GET(
  req: MedusaRequest<{ id: string }>,
  res: MedusaResponse,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "repair_ticket",
    fields: ["*", "device.*", "media.*", "notes.*", "updates.*"],
    filters: { id: [req.params.id] },
  });

  if (!data || data.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Repair ticket with id ${req.params.id} not found`,
    );
  }

  const rawTicket = data[0];
  const sanitizedTicket = sanitizeRepairTicket(rawTicket);

  // Fetch linked product variants (parts)
  let parts = [];
  try {
    const linkQuery = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    // First try with plural name which is standard for isList: true
    const { data: ticketWithParts } = await linkQuery.graph({
      entity: "repair_ticket",
      fields: ["id", "product_variants.*", "product_variants.product.*", "product_variants.prices.*"],
      filters: { id: [req.params.id] },
    });
    parts = ticketWithParts?.[0]?.product_variants || [];
  } catch (err) {
    try {
      const linkQuery = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: ticketWithParts } = await linkQuery.graph({
        entity: "repair_ticket",
        fields: ["id", "product_variant.*", "product_variant.product.*", "product_variant.prices.*"],
        filters: { id: [req.params.id] },
      });
      parts = ticketWithParts?.[0]?.product_variant || [];
    } catch (err2) {
      // both failed, which means the link isn't established properly in query graph graph, return empty parts.
    }
  }

  let customerInfo: any = null;
  if (sanitizedTicket.customer_id) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["first_name", "last_name", "phone"],
        filters: { id: [sanitizedTicket.customer_id] },
      });
      if (customers && customers.length > 0) {
        customerInfo = customers[0];
      }
    } catch (err) {
      // ignore
    }
  }

  let availableDocuments: string[] = [];
  let documentsPluginInstalled = false;
  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService) {
      documentsPluginInstalled = true;
      if (typeof docService.listDocumentRecords === "function") {
        const records = await docService.listDocumentRecords({ repair_ticket_id: req.params.id }).catch(() => []);
        if (Array.isArray(records)) {
          const isTicketPaid = (sanitizedTicket.amount_paid > 0 || sanitizedTicket.total_estimate === 0) && (sanitizedTicket.payment_status === "captured" || sanitizedTicket.payment_status === "paid");
          availableDocuments = records
            .filter((r: any) => isTicketPaid || r.type !== "receipt")
            .map((r: any) => r.type === "estimate" ? "quote" : r.type);
        }
      }
    }
  } catch (_) {}

  res.json({
    repair_ticket: {
      ...sanitizedTicket,
      customer: customerInfo,
      customer_phone: customerInfo?.phone || "",
      parts,
      available_documents: availableDocuments,
      documents_plugin_installed: documentsPluginInstalled,
    },
    documents_plugin_installed: documentsPluginInstalled,
  });
}

// DELETE /admin/repairs/:id - Delete repair ticket and cascade cleanup
export async function DELETE(
  req: MedusaRequest<{ id: string }>,
  res: MedusaResponse,
) {
  const { id } = req.params;
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  const logger: any = req.scope.resolve("logger", { allowUnregistered: true });

  const tickets = await repairService.listRepairTickets({ id });
  if (!tickets || tickets.length === 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Repair ticket with id ${id} not found`,
    );
  }

  // 1. Delegate document cleanup to medusajs-documents-plugin
  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService && typeof docService.deleteDocumentsForRepairTicket === "function") {
      await docService.deleteDocumentsForRepairTicket(id, req.scope);
    }
  } catch (docErr: any) {
    logger?.warn?.(`[deleteRepairTicket] Failed to delete linked documents: ${docErr.message}`);
  }

  // 2. Delete linked notes, media, updates, links
  try {
    const notes = await repairService.listRepairNotes({ repair_ticket_id: id }).catch(() => []);
    if (notes.length > 0) {
      await repairService.deleteRepairNotes(notes.map((n: any) => n.id));
    }
  } catch (_) {}

  try {
    const media = await repairService.listRepairMedias({ repair_ticket_id: id }).catch(() => []);
    if (media.length > 0) {
      await repairService.deleteRepairMedias(media.map((m: any) => m.id));
    }
  } catch (_) {}

  try {
    const updates = await repairService.listRepairUpdates({ repair_ticket_id: id }).catch(() => []);
    if (updates.length > 0) {
      await repairService.deleteRepairUpdates(updates.map((u: any) => u.id));
    }
  } catch (_) {}

  // 3. Delete the ticket itself
  await repairService.deleteRepairTickets(id);

  logger?.info?.(`[deleteRepairTicket] Successfully deleted repair ticket ${id}`);

  res.json({
    id,
    object: "repair_ticket",
    deleted: true,
  });
}

