import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// Format helpers
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString?: string | Date) => {
  if (!dateString) return new Date().toLocaleDateString("en-GB");
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return new Date().toLocaleDateString("en-GB");
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};

export async function getOrGenerateShortUrl(url: string, repairService: any, storeUrl: string): Promise<string> {
  if (!url) return url;
  try {
    const existing = await repairService.listRepairLinks({ url });
    if (existing && existing.length > 0) {
      return `${storeUrl}/r/${existing[0].shortcode}`;
    }
    const shortcode = Math.random().toString(36).substring(2, 8);
    await repairService.createRepairLinks({
      shortcode,
      url,
    });
    return `${storeUrl}/r/${shortcode}`;
  } catch (e) {
    return url;
  }
}

// ---------------------------------------------------------------------------------
// CENTRAL CONTROLLER
// Pushes all document creation logic to medusajs-documents-plugin.
// No local PDFKit generation or fallback is performed in this plugin.
// ---------------------------------------------------------------------------------
export async function generateRepairDocument(
  docType: string,
  ticket: any,
  customerName: string,
  res: MedusaResponse,
  req: MedusaRequest,
) {
  const logger: any = req.scope.resolve("logger", { allowUnregistered: true });

  const cleanType = (docType || "job_card").toLowerCase().trim();
  const typeFilter = cleanType === "quote" ? "estimate" : cleanType;

  const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
  if (!docService) {
    logger?.error?.("[generateRepairDocument] Documents module is not registered. Document generation requires medusajs-documents-plugin.");
    return res.status(500).json({
      message: "Documents module is required for document generation. No local PDF fallback is enabled.",
      error: "documents_module_not_found",
    });
  }

  try {
    // 1. Check for existing document record in documents module first
    const docs = await docService.listDocumentRecords({
      repair_ticket_id: ticket.id,
      type: typeFilter,
    }).catch(() => []);

    if (docs && docs.length > 0) {
      docs.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const primaryDoc = docs[0];
      const pdfBuf = await docService.getPdfForRecord(primaryDoc.id, req.scope).catch(() => null);
      if (pdfBuf) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${cleanType}-${ticket.ticket_number}.pdf"`);
        res.setHeader("Content-Length", String(pdfBuf.length));
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(pdfBuf);
      }
    }

    // 2. Generate new document via documents module
    const cleanTicketNumber = String(ticket.ticket_number || "").replace(/^(JOB-|RT-)+/i, "");
    const displayId =
      cleanType === "job_card"
        ? `JOB-${cleanTicketNumber}`
        : cleanType === "service_report"
        ? `SRV-${cleanTicketNumber}`
        : cleanType === "handover"
        ? `HO-${cleanTicketNumber}`
        : cleanType === "receipt"
        ? `RCPT-${cleanTicketNumber}`
        : cleanType === "quote" || cleanType === "estimate"
        ? `EST-${cleanTicketNumber}`
        : `RT-${cleanTicketNumber}`;

    const amountPaidNum = Number(ticket.amount_paid || 0);
    const isPaid = ticket.payment_status === "paid" || ticket.payment_status === "captured" || amountPaidNum > 0;
    if (cleanType === "receipt" && !isPaid && amountPaidNum <= 0) {
      throw new Error(`Cannot generate receipt for unpaid repair ticket #${ticket.ticket_number}.`);
    }
    const payRef = (ticket.metadata as any)?.paystack_reference || (ticket.metadata as any)?.payment_reference;

    const genRes = await docService.generateDocument({
      display_id: displayId,
      title:
        cleanType === "job_card"
          ? "Repair Job Card"
          : cleanType === "service_report"
          ? "Service & Diagnostic Report"
          : cleanType === "handover"
          ? "Equipment Handover & Inspection"
          : cleanType === "receipt"
          ? "Repair Payment Receipt"
          : cleanType === "quote" || cleanType === "estimate"
          ? "Repair Estimate / Quote"
          : "Repair Invoice",
      type: typeFilter,
      repair_ticket_id: ticket.id,
      currency_code: ticket.currency_code || "KES",
      customer: {
        name: customerName || "Valued Customer",
        email: ticket.customer_email || undefined,
        phone: ticket.customer_phone || undefined,
      },
      payment_status: isPaid ? "paid" : "unpaid",
      payment_reference: payRef,
      total: cleanType === "receipt" ? (amountPaidNum > 0 ? amountPaidNum : Number(ticket.total_actual || ticket.total_estimate || 0)) : Number(ticket.total_actual || ticket.total_estimate || 0),
      amount_paid: amountPaidNum,
      force_source: "zoho",
      auto_send: false,
    }, req.scope);

    if (genRes?.record) {
      try {
        const repairService: any = req.scope.resolve("repair", { allowUnregistered: true });
        if (repairService) {
          const currentMeta = (ticket.metadata as any) || {};
          const metaUpdate: any = {
            ...currentMeta,
            last_document_generated: cleanType,
            pdf_url: genRes.record.pdf_url || currentMeta.pdf_url,
          };
          if (cleanType === "quote" || cleanType === "estimate") {
            if (genRes.record.zoho_document_id) {
              metaUpdate.zoho_estimate_id = genRes.record.zoho_document_id;
            }
          } else if (cleanType === "invoice") {
            if (genRes.record.zoho_document_id) {
              metaUpdate.zoho_invoice_id = genRes.record.zoho_document_id;
            }
          } else if (cleanType === "receipt") {
            if (genRes.record.zoho_document_id) {
              metaUpdate.zoho_payment_id = genRes.record.zoho_document_id;
            }
          } else if (cleanType === "job_card") {
            metaUpdate.job_card_id = genRes.record.id;
            metaUpdate.job_card_created = true;
          }
          await repairService.updateRepairTickets({
            id: ticket.id,
            metadata: metaUpdate,
          });
        }
      } catch (metaErr: any) {
        logger?.warn?.(`[generateRepairDocument] Failed to update ticket metadata: ${metaErr.message}`);
      }
    }

    if (genRes?.pdfBuffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${cleanType}-${ticket.ticket_number}.pdf"`);
      res.setHeader("Content-Length", String(genRes.pdfBuffer.length));
      return res.send(genRes.pdfBuffer);
    }

    logger?.error?.(`[generateRepairDocument] Documents module returned no PDF buffer for ticket ${ticket.id}`);
    return res.status(500).json({
      message: "Failed to generate document via documents plugin",
      error: "no_pdf_buffer_returned",
    });
  } catch (docErr: any) {
    logger?.error?.(`[generateRepairDocument] Error delegating to documents module: ${docErr?.message || docErr}`);
    return res.status(500).json({
      message: "Failed to generate document via documents plugin",
      error: docErr?.message || "Generation failed",
    });
  }
}
