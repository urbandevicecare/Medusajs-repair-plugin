import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { parseNumberField } from "./sanitize-ticket";

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

  const amountPaidNum = parseNumberField(ticket.amount_paid);
  const totalTargetNum = parseNumberField(ticket.total_actual) > 0 ? parseNumberField(ticket.total_actual) : parseNumberField(ticket.total_estimate);
  const isPaid = (ticket.payment_status === "paid" || ticket.payment_status === "captured") && (amountPaidNum > 0 || totalTargetNum === 0);
  if (cleanType === "receipt" && (!isPaid || (amountPaidNum <= 0 && totalTargetNum > 0))) {
    return res.status(400).json({
      message: `Cannot generate receipt for unpaid repair ticket #${ticket.ticket_number}.`,
      error: "ticket_unpaid",
    });
  }

  const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
  if (!docService) {
    logger?.error?.("[generateRepairDocument] Documents module is not registered. Document generation requires medusajs-documents-plugin.");

    const acceptHeader = (req?.headers && (req.headers["accept"] as string)) || "";
    if (acceptHeader.includes("text/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(503).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documents Plugin Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 520px; width: 100%; padding: 32px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
    .icon { width: 48px; height: 48px; border-radius: 50%; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #0f172a; }
    p { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px 0; }
    .code-box { background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #0f172a; margin-bottom: 20px; word-break: break-all; }
    .btn { display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
    .btn:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    </div>
    <h1>Documents Plugin Required</h1>
    <p>Creating and viewing <strong>${cleanType.replace(/_/g, " ").toUpperCase()}</strong> documents requires the <strong>Medusa Documents Plugin</strong> (<code>medusajs-documents-plugin</code>).</p>
    <p>Please install and enable <code>medusajs-documents-plugin</code> in your Medusa project so that official invoices, quotes, receipts, and Zoho Books integrations can operate.</p>
    <div class="code-box">yarn add medusajs-documents-plugin</div>
    <button onclick="window.close()" class="btn">Close Window</button>
  </div>
</body>
</html>
      `);
    }

    return res.status(500).json({
      message: "Documents module (medusajs-documents-plugin) is not installed. It is required to create invoices, estimates, receipts, and job cards.",
      error: "documents_module_not_found",
      documents_plugin_installed: false,
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
      total: cleanType === "receipt" ? (amountPaidNum > 0 ? amountPaidNum : totalTargetNum) : totalTargetNum,
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
