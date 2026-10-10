import fs from "fs";
import path from "path";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDoc, rgb, degrees, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";
import { ZohoBooksService } from "../services/zoho-books.js";

// Helpers
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const postProcessZohoPdf = async (pdfBuffer: Buffer, ticket: any, docType: string): Promise<Buffer> => {
  try {
    const pdfDoc = await PDFLibDoc.load(pdfBuffer);
    
    // 1. Generate & Embed QR Code Safely
    let qrImage: any = null;
    try {
      const qrUrl = `${process.env.STORE_URL || "http://localhost:3000"}/store/repairs/track?number=${ticket.ticket_number}`;
      const qrBufferLib = await QRCode.toBuffer(qrUrl, {
        errorCorrectionLevel: "H",
        type: "png",
        margin: 1,
        width: 70,
      });
      qrImage = await pdfDoc.embedPng(qrBufferLib);
    } catch (qrErr) {
      console.error("[postProcessZohoPdf] QR Code generation skipped due to error:", qrErr);
    }
    
    // 2. Determine Watermark
    let watermarkText = "";
    let watermarkColor = rgb(0.8, 0.8, 0.8);
    const isPaid = ticket.payment_status === "captured" || ticket.payment_status === "paid" || docType === "receipt";
    
    if (docType === "invoice" || docType === "receipt") {
      watermarkText = isPaid ? "PAID" : "UNPAID";
      watermarkColor = isPaid ? rgb(0.13, 0.77, 0.36) : rgb(0.93, 0.26, 0.26); // green vs red
    } else if (docType === "quote") {
      watermarkText = "QUOTATION";
      watermarkColor = rgb(0.8, 0.8, 0.8);
    }
    
    // Override if cancelled
    if (ticket.status === "cancelled") {
      watermarkText = "CANCELLED";
      watermarkColor = rgb(0.93, 0.26, 0.26);
    }
    
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    
    if (pages.length > 0) {
      const firstPage = pages[0];
      
      // Draw QR Code
      if (qrImage) {
        firstPage.drawImage(qrImage, {
          x: firstPage.getWidth() - 110,
          y: 40,
          width: 70,
          height: 70,
        });
      }
      
      // Draw Watermark
      if (watermarkText) {
        firstPage.drawText(watermarkText, {
          x: firstPage.getWidth() / 2 - 120,
          y: firstPage.getHeight() / 2 - 120,
          size: 80,
          font: helveticaFont,
          color: watermarkColor,
          opacity: 0.15,
          rotate: degrees(45),
        });
      }
    }
    
    // Obscure "Powered by Zoho Books" at the bottom of all pages
    for (const page of pages) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: 35,
        color: rgb(1, 1, 1),
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return Buffer.from(modifiedPdfBytes);
  } catch (e: any) {
    console.error("[postProcessZohoPdf] CRITICAL Error processing PDF:", e?.message || e);
    return pdfBuffer; // fallback to original
  }
};

const formatDate = (dateString: string | Date) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};


async function getOrGenerateShortUrl(url: string, repairService: any, storeUrl: string): Promise<string> {
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

export async function generateRepairDocument(
  docType: string,
  ticket: any,
  customerName: string,
  res: MedusaResponse,
  req: MedusaRequest,
) {
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  const [settings] = await repairService.listRepairSettings({});
  let zohoError = "";
  
  if (!settings?.zoho_books_enabled) { 
    zohoError = "Zoho Books Integration is disabled in Admin settings."; 
  } else if (!settings.zoho_client_id || !settings.zoho_client_secret || !settings.zoho_refresh_token || !settings.zoho_organization_id) { 
    zohoError = "Zoho Books enabled but missing API credentials."; 
  } else {
    const logger = req.scope.resolve("logger");
    const zoho = new ZohoBooksService({
      client_id: settings.zoho_client_id,
      client_secret: settings.zoho_client_secret,
      refresh_token: settings.zoho_refresh_token,
      organization_id: settings.zoho_organization_id,
      domain: settings.zoho_domain || "com",
    }, logger);

    try {
      // 1. Sync Contact
      let customerObj: any = { email: `guest-${ticket.id}@example.com`, first_name: customerName };
      if (ticket.customer_id) {
        const customerModule = req.scope.resolve("customer", { allowUnregistered: true });
        if (customerModule) {
          const c = await customerModule.retrieveCustomer(ticket.customer_id);
          if (c) customerObj = c;
        }
      }
      
      const contactId = await zoho.syncContact(customerObj);
      
      // 2. Generate Estimate or Invoice or Receipt
      const metadata = ticket.metadata || {};

      const targetTotal = (ticket.total_actual && ticket.total_actual > 0) ? ticket.total_actual : ticket.total_estimate;
      const balanceDue = Math.max(0, targetTotal - (ticket.amount_paid || 0));
      if (balanceDue > 0 && ticket.approval_token && (docType === "invoice" || docType === "quote")) {
          let sUrl = process.env.STORE_URL || "http://localhost:3000";
          if (settings?.storefront_url) sUrl = settings.storefront_url;
          sUrl = sUrl.replace(/\/$/, "");
          const lUrl = `${sUrl}/repairs/track?token=${ticket.approval_token}`;
          const shortL = await getOrGenerateShortUrl(lUrl, repairService, sUrl);
          ticket._paymentLinkText = `Pay Online: ${shortL}`;
      }

      if (docType === "quote") {
        let estId = metadata.zoho_estimate_id as string;
        if (!estId) {
          estId = await zoho.createEstimate(contactId, ticket);
          await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_estimate_id: estId } });
        }
        const pdfBuffer = await zoho.getDocumentPdf(estId, "estimate");
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, docType);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Quote-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      } else if (docType === "receipt" && metadata.zoho_payment_id) {
        const pdfBuffer = await zoho.getPaymentReceiptPdf(metadata.zoho_payment_id as string);
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, docType);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Receipt-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      } else if (docType === "invoice") {
        let invId = metadata.zoho_invoice_id as string;
        if (!invId) {
          invId = await zoho.createInvoice(contactId, ticket);
          await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_invoice_id: invId } });
        }
        const pdfBuffer = await zoho.getDocumentPdf(invId, "invoice");
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, docType);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Invoice-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      }
      // If docType is "job_card" or anything else, it bypasses Zoho and generates locally using PDFKit
    } catch (e: any) {
      zohoError = `Zoho Sync Error: ${e.message}`; 
      logger.error(`Zoho Books Integration failed: ${e.message}.`);
    }
  }

  const parseNum = (val: any) => {
    if (!val) return 0;
    if (typeof val === "object" && "value" in val) return Number(val.value);
    return Number(val);
  };

  const tTotal = parseNum(ticket.total_estimate);
  const tActual = parseNum(ticket.total_actual);
  const finalTotal = ticket.status === "completed" && tActual > 0 ? tActual : tTotal;

  // Generate QR code
  const qrUrl = `${process.env.STORE_URL || "http://localhost:3000"}/store/repairs/track?number=${ticket.ticket_number}`;
  let qrBuffer: Buffer | null = null;
  try {
    qrBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: "H",
      type: "png",
      margin: 1,
      width: 60,
    });
  } catch (e) {}

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ticket.ticket_number}-${docType}.pdf"`,
  );

  doc.pipe(res);

  // 1. Logo
  try {
      if (settings?.pdf_logo_url) {
          const response = await fetch(settings.pdf_logo_url);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          doc.image(buffer, 50, 40, { width: 140 });
      } else {
          const logoPath = path.resolve(process.cwd(), "src/utils/assets/logo.png");
          if (fs.existsSync(logoPath)) {
              doc.image(logoPath, 50, 40, { width: 140 });
          } else {
              doc.fontSize(24).font("Helvetica-Bold").fillColor("#333").text(settings?.company_name || "URBAN DEVICE CARE", 50, 50);
          }
      }
  } catch (e) {
      doc.fontSize(24).font("Helvetica-Bold").fillColor("#333").text(settings?.company_name || "URBAN DEVICE CARE", 50, 50);
  }

  // Address below logo
  let addressY = 95;
  if (settings?.company_name) {
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000").text(settings.company_name.toUpperCase(), 50, addressY);
      addressY += 14;
  }
  doc.fontSize(9).font("Helvetica").fillColor("#666");
  if (settings?.pdf_address) {
      doc.text(settings.pdf_address, 50, addressY, { width: 250 });
      addressY += doc.heightOfString(settings.pdf_address, { width: 250 }) + 2;
  }
  if (settings?.pdf_phone) { doc.text(`Phone: ${settings.pdf_phone}`, 50, addressY); addressY += 12; }
  if (settings?.pdf_email) { doc.text(`Email: ${settings.pdf_email}`, 50, addressY); addressY += 12; }
  if (settings?.pdf_website) { doc.text(`Web: ${settings.pdf_website}`, 50, addressY); addressY += 12; }

  // 2. Document Title & Number
  let title = "INVOICE";
  let prefix = "INV";
  if (docType === "job_card") { title = "JOB CARD"; prefix = "JOB"; }
  else if (docType === "receipt") { title = "RECEIPT"; prefix = "REC"; }
  else if (docType === "quote") { title = "QUOTATION"; prefix = "QUO"; }

  doc.fontSize(26).font("Helvetica").fillColor("#000").text(title, 350, 50, { align: "right" });
  
  // Format doc number
  let docNumber = `RT-${ticket.ticket_number}`;
  if (docType === "receipt") {
    // try to get invoice number if synced
    if (ticket.metadata?.zoho_invoice_id) {
        docNumber = `INV-${ticket.metadata.zoho_invoice_id}`; 
    }
  }
  
  doc.fontSize(10).font("Helvetica-Bold").text(docNumber, 350, 80, { align: "right" });

  if (docType === "invoice") {
      const isPaid = ticket.payment_status === "captured" || ticket.payment_status === "paid" || ticket.status === "completed";
      const statusText = isPaid ? "PAID" : "UNPAID";
      const statusColor = isPaid ? "#008000" : "#CC0000";
      doc.fontSize(10).font("Helvetica-Bold").fillColor(statusColor).text(statusText, 350, 95, { align: "right" });
  }

  // 3. Balance Due
  let balanceDue = 0;
  let paymentMade = 0;
  if (docType === "invoice") {
     paymentMade = parseNum(ticket.amount_paid) || 0;
     balanceDue = finalTotal - paymentMade;
  } else if (docType === "receipt") {
     paymentMade = parseNum(ticket.amount_paid) || finalTotal; 
  }
  
  if (docType === "invoice") {
      doc.fontSize(9).font("Helvetica").fillColor("#666").text("Balance Due", 350, 115, { align: "right" });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text(`KES${formatCurrency(balanceDue)}`, 350, 128, { align: "right" });
  } else if (docType === "receipt") {
      doc.fontSize(9).font("Helvetica").fillColor("#666").text("Amount Paid", 350, 115, { align: "right" });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#008000").text(`KES${formatCurrency(paymentMade)}`, 350, 128, { align: "right" });
  }

  let currentY = 170;

  // 4. Meta Information
  doc.rect(50, currentY, 495, 2).fill("#EEEEEE");
  currentY += 15;
  
  const metaY = currentY;
  let rowY = metaY;

  const addMetaRow = (label: string, value: string, yPos: number) => {
      doc.font("Helvetica").fontSize(9).fillColor("#666").text(label, 350, yPos, { width: 80, align: "right" });
      doc.font("Helvetica-Bold").fillColor("#000").text(value, 440, yPos, { width: 105, align: "right" });
  };

  if (docType === "quote") {
      addMetaRow("Job Card No :", ticket.ticket_number, rowY); rowY += 15;
      addMetaRow("Quote Date :", formatDate(ticket.created_at || new Date()), rowY); rowY += 15;
      const validUntil = new Date(ticket.created_at || new Date());
      validUntil.setDate(validUntil.getDate() + 14);
      addMetaRow("Valid Until :", formatDate(validUntil), rowY); rowY += 15;
  } else if (docType === "job_card") {
      addMetaRow("Intake Date :", formatDate(ticket.created_at || new Date()), rowY); rowY += 15;
      addMetaRow("Status :", String(ticket.status || "Unknown").toUpperCase(), rowY); rowY += 15;
  } else if (docType === "receipt") {
      addMetaRow("Payment Date :", formatDate(new Date()), rowY); rowY += 15;
      addMetaRow("Payment Ref :", ticket.payment_collection_id || "Cash/Manual", rowY); rowY += 15;
  } else {
      addMetaRow("Job Card No :", ticket.ticket_number, rowY); rowY += 15;
      addMetaRow("Invoice Date :", formatDate(ticket.created_at || new Date()), rowY); rowY += 15;
      addMetaRow("Terms :", "Due on Receipt", rowY); rowY += 15;
  }

  // Bill To / Customer Data
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(customerName || "Customer", 50, metaY);
  doc.font("Helvetica").fontSize(9).fillColor("#333");
  
  currentY = Math.max(rowY, metaY + 40) + 20;

  // DOCUMENT SPECIFIC LAYOUTS
  
  if (docType === "job_card") {
      // --- JOB CARD LAYOUT (Minimal, Info-only, No Prices) ---
      
      doc.rect(50, currentY, 495, 20).fill("#444444");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
      doc.text("DEVICE DETAILS", 60, currentY + 6);
      currentY += 30;
      
      doc.fillColor("#333333").font("Helvetica").fontSize(9);
      if (ticket.device) {
          doc.font("Helvetica-Bold").text("Brand / Model:", 50, currentY);
          doc.font("Helvetica").text(`${ticket.device.brand || "Unknown"} ${ticket.device.model_name || ""}`, 150, currentY); currentY += 15;
          
          doc.font("Helvetica-Bold").text("Serial Number:", 50, currentY);
          doc.font("Helvetica").text(ticket.device.serial_number || "N/A", 150, currentY); currentY += 15;
          
          doc.font("Helvetica-Bold").text("IMEI:", 50, currentY);
          doc.font("Helvetica").text(ticket.device.imei || "N/A", 150, currentY); currentY += 15;
          
          doc.font("Helvetica-Bold").text("Condition:", 50, currentY);
          doc.font("Helvetica").text(ticket.device.condition || "Not specified", 150, currentY, { width: 350 }); 
          currentY += doc.heightOfString(ticket.device.condition || "Not specified", { width: 350 }) + 5;
      }
      
      doc.font("Helvetica-Bold").text("Accessories:", 50, currentY);
      doc.font("Helvetica").text(ticket.accessories || "None", 150, currentY, { width: 350 });
      currentY += doc.heightOfString(ticket.accessories || "None", { width: 350 }) + 15;
      
      doc.rect(50, currentY, 495, 20).fill("#444444");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
      doc.text("REPORTED ISSUE", 60, currentY + 6);
      currentY += 30;
      
      doc.fillColor("#333333").font("Helvetica").fontSize(9);
      doc.text(ticket.issue_description || "No description provided.", 50, currentY, { width: 495 });
      currentY += doc.heightOfString(ticket.issue_description || "No description provided.", { width: 495 }) + 30;
      
      // Signatures
      if (currentY > 650) { doc.addPage(); currentY = 50; }
      doc.moveTo(50, currentY).lineTo(250, currentY).strokeColor("#000000").stroke();
      doc.fontSize(10).font("Helvetica").text("Technician Signature", 50, currentY + 5);
      
      doc.moveTo(350, currentY).lineTo(545, currentY).stroke();
      doc.text("Customer Signature", 350, currentY + 5);

  } else if (docType === "receipt") {
      // --- RECEIPT LAYOUT ---
      
      doc.rect(50, currentY, 495, 20).fill("#444444");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
      doc.text("PAYMENT DETAILS", 60, currentY + 6);
      currentY += 30;
      
      doc.fillColor("#333333").font("Helvetica").fontSize(9);
      doc.font("Helvetica-Bold").text("Payment Reference:", 50, currentY);
      doc.font("Helvetica").text(ticket.payment_collection_id || "Manual Capture / Cash", 170, currentY); currentY += 15;
      
      doc.font("Helvetica-Bold").text("Amount Paid:", 50, currentY);
      doc.font("Helvetica").text(`KES ${formatCurrency(paymentMade)}`, 170, currentY); currentY += 15;
      
      doc.font("Helvetica-Bold").text("For Job Card:", 50, currentY);
      doc.font("Helvetica").text(ticket.ticket_number, 170, currentY); currentY += 30;
      
      // Stamp
      doc.save()
         .translate(400, currentY + 20)
         .rotate(-15)
         .rect(0, 0, 100, 40)
         .lineWidth(3)
         .strokeColor("#22c55e")
         .stroke()
         .fontSize(20)
         .font("Helvetica-Bold")
         .fillColor("#22c55e")
         .text("PAID", 22, 10)
         .restore();
         
      currentY += 80;

  } else {
      // --- QUOTE / INVOICE LAYOUT (Pricing tables) ---
      
      doc.rect(50, currentY, 495, 20).fill("#444444");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
      doc.text("#", 60, currentY + 6);
      doc.text("Description", 90, currentY + 6);
      doc.text("Qty", 350, currentY + 6, { width: 30, align: "center" });
      doc.text("Rate", 390, currentY + 6, { width: 60, align: "right" });
      doc.text("Amount", 460, currentY + 6, { width: 75, align: "right" });
      
      currentY += 30;
      doc.fillColor("#333333").font("Helvetica").fontSize(9);

      let i = 1;
      const drawRow = (desc: string, qty: number, rate: number, amt: number) => {
          if (currentY > 650) { doc.addPage(); currentY = 50; }
          
          doc.text(i.toString(), 60, currentY);
          doc.text(desc, 90, currentY, { width: 250 });
          doc.text(qty.toFixed(2), 350, currentY, { width: 30, align: "center" });
          doc.text(formatCurrency(rate), 390, currentY, { width: 60, align: "right" });
          doc.text(formatCurrency(amt), 460, currentY, { width: 75, align: "right" });
          
          const height = doc.heightOfString(desc, { width: 250 }) || 10;
          currentY += height + 10;
          
          doc.moveTo(50, currentY - 5).lineTo(545, currentY - 5).lineWidth(0.5).strokeColor("#EEEEEE").stroke();
          i++;
      };

      if (ticket.parts && Array.isArray(ticket.parts)) {
          for (const p of ticket.parts) {
              const price = parseNum(p.prices?.[0]?.amount);
              drawRow(`${p.title} (SKU: ${p.sku || "N/A"})`, 1, price, price);
          }
      }

      if (ticket.custom_parts && Array.isArray(ticket.custom_parts)) {
          for (const cp of ticket.custom_parts) {
              const price = parseNum(cp.price);
              drawRow(cp.name, 1, price, price);
          }
      }

      const labor = parseNum(ticket.labor_estimate);
      if (labor > 0) {
          drawRow("Labor & Service Fee", 1, labor, labor);
      }

      if (i === 1) {
          doc.text("No cost items added yet.", 90, currentY);
          currentY += 20;
          doc.moveTo(50, currentY - 5).lineTo(545, currentY - 5).lineWidth(0.5).strokeColor("#EEEEEE").stroke();
      }

      currentY += 10;
      const summaryX = 350;

      const addSummaryRow = (label: string, value: string, yPos: number, isBold: boolean = false, valColor: string = "#333", bg: boolean = false) => {
          if (bg) { doc.rect(250, yPos - 5, 295, 20).fill("#F4F4F4"); }
          doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor("#333").fontSize(9);
          doc.text(label, summaryX, yPos, { width: 80, align: "right" });
          doc.fillColor(valColor).font(isBold ? "Helvetica-Bold" : "Helvetica").text(value, summaryX + 90, yPos, { width: 95, align: "right" });
      };

      addSummaryRow("Sub Total", formatCurrency(finalTotal), currentY); currentY += 20;
      doc.moveTo(300, currentY - 10).lineTo(545, currentY - 10).lineWidth(0.5).strokeColor("#DDDDDD").stroke();

      addSummaryRow("Total", `KES ${formatCurrency(finalTotal)}`, currentY, true); currentY += 20;

      if (docType === "invoice") {
          addSummaryRow("Payment Made", `(-) ${formatCurrency(paymentMade)}`, currentY, false, "#C00000"); currentY += 20;
          addSummaryRow("Balance Due", `KES ${formatCurrency(balanceDue)}`, currentY, true, "#000", true); currentY += 20;
      }
  }

  // Terms and conditions
  if (settings?.pdf_terms && docType !== "receipt") {
      currentY += 40;
      if (currentY > 650) { doc.addPage(); currentY = 50; }
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333").text("Terms & Conditions", 50, currentY);
      doc.fontSize(8).font("Helvetica").fillColor("#666").text(settings.pdf_terms, 50, currentY + 15, { width: 495 });
  }

  const pageHeight = doc.page.height;
  const footerY = pageHeight - 90;
  
  let paymentLinkText = "";
  if (docType === "invoice" || docType === "quote") {
      const targetTotal = (ticket.total_actual && ticket.total_actual > 0) ? ticket.total_actual : ticket.total_estimate;
      const balanceDue = Math.max(0, targetTotal - (ticket.amount_paid || 0));
      if (balanceDue > 0 && ticket.approval_token) {
          let storeUrl = process.env.STORE_URL || "http://localhost:3000";
          if (settings?.storefront_url) storeUrl = settings.storefront_url;
          storeUrl = storeUrl.replace(/\/$/, "");
          
          const longUrl = `${storeUrl}/repairs/track?token=${ticket.approval_token}`;
          const shortUrl = await getOrGenerateShortUrl(longUrl, repairService, storeUrl);
          paymentLinkText = `Pay Online: ${shortUrl} | `;
      }
  }
  
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#333");
  if (settings?.pdf_payment_details && docType !== "receipt") {
      doc.text(paymentLinkText + settings.pdf_payment_details.replace(/\n/g, ' | '), 50, footerY, { width: 495 });
  } else if (docType !== "receipt") {
      doc.text(paymentLinkText + "Thanks for your business. | Paybill: 880100 - Acc No: PAYURBANDEVICE", 50, footerY);
  } else {
      doc.text("Thanks for your business.", 50, footerY);
  }

  if (qrBuffer) {
      doc.image(qrBuffer, 485, footerY - 20, { width: 60 });
  }
  
  doc.moveTo(50, footerY + 30).lineTo(545, footerY + 30).lineWidth(0.5).strokeColor("#CCCCCC").stroke();
  doc.fontSize(8).font("Helvetica").fillColor("#999").text(`POWERED BY ${settings?.company_name?.toUpperCase() || "URBAN DEVICE CARE"}`, 50, footerY + 40, { lineBreak: false });
  doc.text("1", 530, footerY + 40, { align: "right", lineBreak: false });

  let localWatermarkText = "";
  let localWatermarkColor = "#cccccc";
  const localIsPaid = ticket.payment_status === "captured" || ticket.payment_status === "paid" || docType === "receipt";
  
  if (docType === "invoice" || docType === "receipt") {
    localWatermarkText = localIsPaid ? "PAID" : "UNPAID";
    localWatermarkColor = localIsPaid ? "#22c55e" : "#ef4444"; 
  } else if (docType === "quote") {
    localWatermarkText = "QUOTATION";
    localWatermarkColor = "#cccccc";
  }
  
  if (ticket.status === "cancelled") {
    localWatermarkText = "CANCELLED";
    localWatermarkColor = "#ef4444";
  }

  if (localWatermarkText) {
    doc.save()
       .translate(doc.page.width / 2, doc.page.height / 2)
       .rotate(-45, { origin: [0, 0] })
       .fontSize(100)
       .fillColor(localWatermarkColor)
       .fillOpacity(0.15)
       .text(localWatermarkText, -250, -50, { align: "center", width: 500 })
       .restore();
  }

  doc.end();
}
