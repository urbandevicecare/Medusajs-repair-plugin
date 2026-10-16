import fs from "fs";
import path from "path";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import PDFDocument from "pdfkit";
import { PDFDocument as PDFLibDoc, rgb, degrees, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";
import { ZohoBooksService } from "../services/zoho-books.js";

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

export const postProcessZohoPdf = async (pdfBuffer: Buffer, ticket: any, docType: string): Promise<Buffer> => {
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
      console.error("[postProcessZohoPdf] QR Code generation skipped:", qrErr);
    }
    
    // 2. Determine Watermark
    let watermarkText = "";
    let watermarkColor = rgb(0.8, 0.8, 0.8);
    const isPaid = ticket.payment_status === "captured" || ticket.payment_status === "paid" || docType === "receipt";
    
    if (docType === "invoice" || docType === "receipt") {
      watermarkText = isPaid ? "PAID" : "UNPAID";
      watermarkColor = isPaid ? rgb(0.13, 0.77, 0.36) : rgb(0.93, 0.26, 0.26);
    } else if (docType === "quote" || docType === "estimate") {
      watermarkText = "QUOTATION";
      watermarkColor = rgb(0.8, 0.8, 0.8);
    }
    
    if (ticket.status === "cancelled") {
      watermarkText = "CANCELLED";
      watermarkColor = rgb(0.93, 0.26, 0.26);
    }
    
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    
    if (pages.length > 0) {
      const firstPage = pages[0];
      if (qrImage) {
        firstPage.drawImage(qrImage, {
          x: firstPage.getWidth() - 110,
          y: 40,
          width: 70,
          height: 70,
        });
      }
      
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
    console.error("[postProcessZohoPdf] Error processing PDF:", e?.message || e);
    return pdfBuffer;
  }
};

// Helper to resolve logo buffer
async function resolveLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
  if (logoUrl) {
    try {
      if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
        const res = await fetch(logoUrl);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          return Buffer.from(ab);
        }
      } else if (fs.existsSync(logoUrl)) {
        return fs.readFileSync(logoUrl);
      }
    } catch (e) {}
  }
  const defaultLogo = path.resolve(process.cwd(), "src/utils/assets/logo.png");
  if (fs.existsSync(defaultLogo)) {
    try {
      return fs.readFileSync(defaultLogo);
    } catch (e) {}
  }
  return null;
}

// ---------------------------------------------------------------------------------
// CONSISTENT COMPANY HEADER DRAWING HELPER
// ---------------------------------------------------------------------------------
function drawConsistentHeader(
  doc: PDFKit.PDFDocument,
  logoBuffer: Buffer | null,
  settings: any,
  titleConfig: {
    title: string;
    subtitle?: string;
    docNumber?: string;
    dateLabel?: string;
    dateValue?: string;
    badgeText?: string;
    badgeColor?: string;
    amountLabel?: string;
    amountValue?: string;
    amountColor?: string;
  }
): number {
  const leftX = 45;
  const rightX = 330;
  const rightW = 220;
  let topY = 40;

  // 1. Logo or Brand Name on Top-Left
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, leftX, topY, { fit: [140, 50] });
    } catch (e) {
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#111827").text(settings?.company_name || "URBAN DEVICE CARE LTD", leftX, topY);
    }
  } else {
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#111827").text(settings?.company_name || "URBAN DEVICE CARE LTD", leftX, topY);
  }

  // 2. Company Details below Logo
  let detailsY = topY + 54;
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111827").text((settings?.company_name || "Urban Device Care Ltd").toUpperCase(), leftX, detailsY);
  detailsY += 12;

  doc.fontSize(8).font("Helvetica").fillColor("#4b5563");
  const address = settings?.pdf_address || "Bekim House, Westlands Crossway Road\nNairobi 00800, Kenya";
  doc.text(address, leftX, detailsY, { width: 230 });
  detailsY += doc.heightOfString(address, { width: 230 }) + 2;

  const phone = settings?.pdf_phone || "0729436660 / 0794700241";
  doc.text(`Tel: ${phone}`, leftX, detailsY);
  detailsY += 11;

  const email = settings?.pdf_email || "info@urbandevicecare.co.uk";
  doc.text(`Email: ${email}`, leftX, detailsY);
  detailsY += 11;

  if (settings?.pdf_website) {
    doc.text(`Web: ${settings.pdf_website}`, leftX, detailsY);
    detailsY += 11;
  }

  const kraPin = settings?.kra_pin || "P052534849N";
  doc.font("Helvetica-Bold").fillColor("#111827").text(`KRA PIN: ${kraPin}`, leftX, detailsY);
  detailsY += 14;

  // 3. Right Header Block (Document title, number, date, badges)
  let rightY = topY;
  if (titleConfig.subtitle) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#6b7280").text(titleConfig.subtitle, rightX, rightY, { width: rightW, align: "right" });
    rightY += 13;
  }

  const titleFontSize = titleConfig.title.length > 15 ? 16 : 20;
  doc.fontSize(titleFontSize).font("Helvetica-Bold").fillColor("#111827");
  const titleHeight = doc.heightOfString(titleConfig.title, { width: rightW });
  doc.text(titleConfig.title, rightX, rightY, { width: rightW, align: "right" });
  rightY += titleHeight + 4;

  if (titleConfig.docNumber) {
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151").text(titleConfig.docNumber, rightX, rightY, { width: rightW, align: "right" });
    rightY += 13;
  }

  if (titleConfig.badgeText) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor(titleConfig.badgeColor || "#dc2626").text(titleConfig.badgeText, rightX, rightY, { width: rightW, align: "right" });
    rightY += 14;
  }

  if (titleConfig.amountLabel && titleConfig.amountValue) {
    doc.fontSize(8.5).font("Helvetica").fillColor("#6b7280").text(titleConfig.amountLabel, rightX, rightY, { width: rightW, align: "right" });
    rightY += 11;
    doc.fontSize(13.5).font("Helvetica-Bold").fillColor(titleConfig.amountColor || "#111827").text(titleConfig.amountValue, rightX, rightY, { width: rightW, align: "right" });
    rightY += 18;
  }

  if (titleConfig.dateLabel && titleConfig.dateValue) {
    doc.fontSize(8.5).font("Helvetica").fillColor("#4b5563").text(`${titleConfig.dateLabel}:  ${titleConfig.dateValue}`, rightX, rightY, { width: rightW, align: "right" });
    rightY += 13;
  }

  return Math.max(detailsY, rightY) + 10;
}

// ---------------------------------------------------------------------------------
// 1. ZOHO-EXACT LAYOUT (INVOICE, QUOTE / ESTIMATE, RECEIPT)
// ---------------------------------------------------------------------------------
function renderZohoExactDocument(
  doc: PDFKit.PDFDocument,
  docType: string,
  ticket: any,
  customerName: string,
  settings: any,
  items: any[],
  totals: { totalEstimate: number; amountPaid: number; balanceDue: number },
  logoBuffer: Buffer | null,
  qrBuffer: Buffer | null,
  paymentLinkText: string
) {
  const isInvoice = docType === "invoice";
  const isReceipt = docType === "receipt";
  const isPaid = ticket.payment_status === "captured" || ticket.payment_status === "paid" || ticket.status === "completed" || isReceipt;

  const title = isReceipt ? "PAYMENT RECEIPT" : isInvoice ? "INVOICE" : "ESTIMATE";
  const docNumber = isReceipt ? `REC-RT-${ticket.ticket_number}` : isInvoice ? `RT-RT-${ticket.ticket_number}` : `RT-${ticket.ticket_number}`;
  const badgeText = isReceipt ? "PAID" : isInvoice ? (isPaid ? "PAID" : "UNPAID") : undefined;
  const badgeColor = isPaid ? "#16a34a" : "#dc2626";

  const amountLabel = isReceipt ? "Amount Paid" : isInvoice ? "Balance Due" : "Estimated Total";
  const amountValue = `KES ${formatCurrency(isReceipt ? totals.amountPaid : totals.balanceDue)}`;

  const nextY = drawConsistentHeader(doc, logoBuffer, settings, {
    title,
    docNumber,
    badgeText,
    badgeColor,
    amountLabel,
    amountValue,
    amountColor: isReceipt ? "#16a34a" : "#111827",
  });

  // Thin separator
  let currentY = nextY;
  doc.rect(45, currentY, 505, 1).fill("#e5e7eb");
  currentY += 12;

  // Bill To & Meta Data
  const metaY = currentY;
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#9ca3af").text(isReceipt ? "PAID BY" : "BILL TO", 45, metaY);
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827").text(customerName || "Customer", 45, metaY + 11);

  let cY = metaY + 24;
  doc.fontSize(8.5).font("Helvetica").fillColor("#4b5563");
  if (ticket.customer?.email) { doc.text(ticket.customer.email, 45, cY); cY += 11; }
  if (ticket.customer?.phone) { doc.text(ticket.customer.phone, 45, cY); cY += 11; }

  // Right Meta
  const rightMetaX = 330;
  const rightMetaW = 220;
  let rmY = metaY;

  const addMetaRow = (label: string, value: string) => {
    doc.fontSize(8.5).font("Helvetica").fillColor("#6b7280").text(label, rightMetaX, rmY, { width: 90, align: "left" });
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111827").text(value, rightMetaX + 90, rmY, { width: rightMetaW - 90, align: "right" });
    rmY += 14;
  };

  addMetaRow("Job Card No :", `RT-${ticket.ticket_number}`);
  addMetaRow(isReceipt ? "Payment Date :" : isInvoice ? "Invoice Date :" : "Estimate Date :", formatDate(ticket.created_at));
  addMetaRow("Terms :", isReceipt ? "Paid in Full" : isInvoice ? "Due on Receipt" : "Valid for 14 Days");

  currentY = Math.max(cY, rmY) + 16;

  // Table Header
  doc.rect(45, currentY, 505, 20).fill("#374151");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
  doc.text("#", 50, currentY + 5, { width: 25 });
  doc.text("Description", 78, currentY + 5, { width: 255 });
  doc.text("Qty", 335, currentY + 5, { width: 35, align: "center" });
  doc.text("Rate", 375, currentY + 5, { width: 70, align: "right" });
  doc.text("Amount", 455, currentY + 5, { width: 90, align: "right" });

  currentY += 26;

  // Items
  doc.fillColor("#111827").font("Helvetica").fontSize(8.5);
  let idx = 1;
  for (const item of items) {
    if (currentY > doc.page.height - 130) {
      doc.addPage();
      currentY = 45;
    }

    doc.font("Helvetica").fillColor("#6b7280").text(idx.toString(), 50, currentY, { width: 25 });
    doc.font("Helvetica-Bold").fillColor("#111827").text(item.title, 78, currentY, { width: 255 });
    const titleH = doc.heightOfString(item.title, { width: 255 });
    
    let descH = 0;
    if (item.description) {
      doc.font("Helvetica").fillColor("#6b7280").fontSize(7.5).text(item.description, 78, currentY + titleH + 2, { width: 255 });
      descH = doc.heightOfString(item.description, { width: 255 }) + 2;
    }

    doc.font("Helvetica").fillColor("#111827").fontSize(8.5);
    doc.text(Number(item.quantity || 1).toFixed(2), 335, currentY, { width: 35, align: "center" });
    doc.text(formatCurrency(Number(item.unit_price || 0)), 375, currentY, { width: 70, align: "right" });
    doc.text(formatCurrency(Number(item.total || item.unit_price || 0)), 455, currentY, { width: 90, align: "right" });

    currentY += Math.max(16, titleH + descH + 4);
    doc.rect(45, currentY - 3, 505, 0.5).fill("#f3f4f6");
    idx++;
  }

  currentY += 8;

  // Summary Table
  const sumW = 220;
  const sumX = 330;

  const addSummaryRow = (label: string, value: string, isBold: boolean = false, isBg: boolean = false, valColor: string = "#111827") => {
    if (isBg) {
      doc.rect(sumX - 10, currentY - 3, sumW + 10, 20).fill("#f3f4f6");
    }
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor("#4b5563").fontSize(8.5);
    doc.text(label, sumX, currentY + 1, { width: 100, align: "left" });
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fillColor(valColor).text(value, sumX + 100, currentY + 1, { width: sumW - 100, align: "right" });
    currentY += 18;
  };

  addSummaryRow("Sub Total", formatCurrency(totals.totalEstimate));
  addSummaryRow("Total", `KES ${formatCurrency(totals.totalEstimate)}`, true);
  if (isInvoice || isReceipt) {
    addSummaryRow("Payment Made", `(-) ${formatCurrency(totals.amountPaid)}`, false, false, totals.amountPaid > 0 ? "#16a34a" : "#6b7280");
    addSummaryRow("Balance Due", `KES ${formatCurrency(totals.balanceDue)}`, true, true, "#111827");
  }

  // Terms and conditions
  if (settings?.pdf_terms) {
    currentY += 16;
    if (currentY > doc.page.height - 110) { doc.addPage(); currentY = 45; }
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111827").text("Terms & Conditions", 45, currentY);
    currentY += 11;
    doc.fontSize(7.5).font("Helvetica").fillColor("#6b7280").text(settings.pdf_terms, 45, currentY, { width: 505 });
  }

  // Watermark
  let watermarkText = "";
  let watermarkColor = "#e5e7eb";
  if (ticket.status === "cancelled") {
    watermarkText = "CANCELLED";
    watermarkColor = "#fca5a5";
  } else if (isInvoice || isReceipt) {
    watermarkText = isPaid ? "PAID" : "UNPAID";
    watermarkColor = isPaid ? "#86efac" : "#fca5a5";
  } else {
    watermarkText = "QUOTATION";
    watermarkColor = "#e5e7eb";
  }

  if (watermarkText) {
    doc.save()
       .translate(doc.page.width / 2, doc.page.height / 2)
       .rotate(-45, { origin: [0, 0] })
       .fontSize(90)
       .font("Helvetica-Bold")
       .fillColor(watermarkColor)
       .fillOpacity(0.18)
       .text(watermarkText, -250, -45, { align: "center", width: 500 })
       .restore();
  }

  // Footer
  doc.page.margins.bottom = 0;
  const footerY = doc.page.height - 65;
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151");
  const payInstructions = settings?.pdf_payment_details
    ? settings.pdf_payment_details.replace(/\n/g, " | ")
    : "Thanks for your business. | Paybill: 880100 - Acc No: PAYURBANDEVICE";
  doc.text(`${paymentLinkText}${payInstructions}`, 45, footerY, { width: 440, lineBreak: false });

  if (qrBuffer) {
    try {
      doc.image(qrBuffer, 490, footerY - 15, { width: 55 });
    } catch (e) {}
  }

  doc.rect(45, footerY + 20, 505, 0.5).fill("#d1d5db");
  doc.fontSize(7.5).font("Helvetica").fillColor("#9ca3af");
  doc.text(`POWERED BY ${(settings?.company_name || "URBAN DEVICE CARE LTD").toUpperCase()}`, 45, footerY + 26, { lineBreak: false });
  doc.text("1", 540, footerY + 26, { align: "right", lineBreak: false });
}

// ---------------------------------------------------------------------------------
// 2. REPAIR JOB CARD LAYOUT (WORKSHOP INTAKE & ASSET DETAILS)
// ---------------------------------------------------------------------------------
function renderJobCardDocument(
  doc: PDFKit.PDFDocument,
  ticket: any,
  customerName: string,
  settings: any,
  items: any[],
  totals: { totalEstimate: number; amountPaid: number; balanceDue: number },
  logoBuffer: Buffer | null,
  qrBuffer: Buffer | null
) {
  const nextY = drawConsistentHeader(doc, logoBuffer, settings, {
    title: "JOB CARD",
    subtitle: "Service & Repair Details",
    docNumber: `NO: JC-${ticket.ticket_number}`,
    dateLabel: "Date",
    dateValue: formatDate(ticket.created_at),
  });

  let currentY = nextY;
  doc.rect(45, currentY, 505, 1).fill("#e2e8f0");
  currentY += 15;

  // SECTION 1: CLIENT & ASSET DETAILS
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("CLIENT & ASSET DETAILS", 45, currentY);
  currentY += 14;

  const col1X = 45;
  const col2X = 300;
  const boxTop = currentY;

  // Left Column
  let leftY = boxTop;
  const drawField = (label: string, value: string, xPos: number, yPos: number, isRight: boolean = false) => {
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#334155").text(`${label}:`, xPos, yPos);
    doc.font("Helvetica").fillColor("#0f172a").text(value || "N/A", xPos + (isRight ? 95 : 85), yPos, { width: isRight ? 150 : 160 });
  };

  drawField("Client Name", customerName, col1X, leftY); leftY += 15;
  drawField("Phone", ticket.customer?.phone || "N/A", col1X, leftY); leftY += 15;
  drawField("Email", ticket.customer?.email || "N/A", col1X, leftY); leftY += 15;

  // Right Column
  let rightY = boxTop;
  const brandModel = `${ticket.device?.brand || ""} ${ticket.device?.model_name || "General Device"}`.trim();
  drawField("Item / Asset", brandModel, col2X, rightY, true); rightY += 15;
  drawField("Serial/Model", ticket.device?.serial_number || ticket.device?.imei || "N/A", col2X, rightY, true); rightY += 15;
  drawField("Status", String(ticket.status || "In Progress").replace(/_/g, " ").toUpperCase(), col2X, rightY, true); rightY += 15;
  drawField("Accessories", ticket.accessories || "None", col2X, rightY, true); rightY += 15;

  currentY = Math.max(leftY, rightY) + 12;

  // SECTION 2: JOB DESCRIPTION & DIAGNOSTICS
  doc.rect(45, currentY, 505, 0.5).fill("#e2e8f0");
  currentY += 10;
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("JOB DESCRIPTION & DIAGNOSTICS", 45, currentY);
  currentY += 14;

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#334155").text("Reported Issue:", 45, currentY);
  doc.font("Helvetica").fillColor("#0f172a").text(ticket.issue_description || "Customer reported hardware failure / service required.", 140, currentY, { width: 410 });
  currentY += doc.heightOfString(ticket.issue_description || "Customer reported hardware failure.", { width: 410 }) + 8;

  if (ticket.device?.condition) {
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#334155").text("Intake Condition:", 45, currentY);
    doc.font("Helvetica").fillColor("#0f172a").text(ticket.device.condition, 140, currentY, { width: 410 });
    currentY += doc.heightOfString(ticket.device.condition, { width: 410 }) + 10;
  }

  // SECTION 3: SERVICE WORK & PARTS
  doc.rect(45, currentY, 505, 0.5).fill("#e2e8f0");
  currentY += 10;
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("SERVICE WORK & PARTS", 45, currentY);
  currentY += 14;

  // Table header with borders matching sample
  doc.rect(45, currentY, 505, 1.5).fill("#334155");
  currentY += 4;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8.5);
  doc.text("Task / Part Description", 48, currentY, { width: 250 });
  doc.text("Qty", 325, currentY, { width: 35, align: "center" });
  doc.text("Unit Cost", 375, currentY, { width: 75, align: "right" });
  doc.text("Total", 460, currentY, { width: 85, align: "right" });
  currentY += 14;
  doc.rect(45, currentY, 505, 0.5).fill("#94a3b8");
  currentY += 6;

  for (const item of items) {
    if (currentY > doc.page.height - 120) {
      doc.addPage();
      currentY = 50;
    }

    doc.font("Helvetica").fillColor("#0f172a").fontSize(8.5);
    doc.text(item.title, 48, currentY, { width: 250 });
    doc.text(Number(item.quantity || 1).toString(), 325, currentY, { width: 35, align: "center" });
    doc.text(`KSh ${formatCurrency(Number(item.unit_price || 0))}`, 375, currentY, { width: 75, align: "right" });
    doc.text(`KSh ${formatCurrency(Number(item.total || item.unit_price || 0))}`, 460, currentY, { width: 85, align: "right" });
    const titleH = doc.heightOfString(item.title, { width: 250 });
    const rowH = Math.max(16, titleH + 4);
    currentY += rowH;
    doc.rect(45, currentY - 3, 505, 0.5).fill("#f1f5f9");
  }

  // Total Row
  currentY += 6;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  doc.text("Est. Total:", 375, currentY, { width: 75, align: "right" });
  doc.text(`KSh ${formatCurrency(totals.totalEstimate)}`, 460, currentY, { width: 85, align: "right" });
  currentY += 28;

  // SECTION 4: DUAL SIGNATURES
  if (currentY > doc.page.height - 120) { doc.addPage(); currentY = 50; }
  const sigY = currentY + 30;
  doc.rect(45, sigY, 200, 0.75).fill("#0f172a");
  doc.rect(310, sigY, 200, 0.75).fill("#0f172a");

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#0f172a");
  doc.text("Technician Signature", 45, sigY + 5);
  doc.text("Customer Signature", 310, sigY + 5);

  doc.page.margins.bottom = 0;
  const footerY = doc.page.height - 45;
  doc.fontSize(7.5).font("Helvetica").fillColor("#94a3b8");
  doc.text("Intake Agreement: Diagnostics & component repairs carry standard 90-day warranty coverage. Customer accepts custody release terms.", 45, footerY, { width: 440, lineBreak: false });
  if (qrBuffer) {
    try { doc.image(qrBuffer, 495, footerY - 12, { width: 45 }); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------------
// 3. SERVICE & DIAGNOSTIC REPORT LAYOUT (MATCHING SAMPLES)
// ---------------------------------------------------------------------------------
function renderServiceReportDocument(
  doc: PDFKit.PDFDocument,
  ticket: any,
  customerName: string,
  settings: any,
  items: any[],
  totals: { totalEstimate: number; amountPaid: number; balanceDue: number },
  logoBuffer: Buffer | null
) {
  const nextY = drawConsistentHeader(doc, logoBuffer, settings, {
    subtitle: "SERVICE &",
    title: "DIAGNOSTIC REPORT",
    dateLabel: "Report Date",
    dateValue: formatDate(ticket.created_at),
    docNumber: `Reference:  #SRV-${ticket.ticket_number}`,
  });

  let currentY = nextY;

  // Target Device / Client Box (grey box with thick dark vertical border)
  doc.rect(45, currentY, 505, 40).fill("#f8fafc");
  doc.rect(45, currentY, 3.5, 40).fill("#1e293b");

  const brandModel = `${ticket.device?.brand || ""} ${ticket.device?.model_name || "General Device"}`.trim();
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text(customerName ? `${customerName} — Hardware Diagnostic Proposal` : "Device Diagnostic Proposal", 55, currentY + 7);
  doc.fontSize(8.5).font("Helvetica").fillColor("#475569").text(`Model: ${brandModel}  •  Serial Number: ${ticket.device?.serial_number || "N/A"}  •  Status: ${String(ticket.status || "Diagnosed").replace(/_/g, " ").toUpperCase()}`, 55, currentY + 22);

  currentY += 50;

  // Table with dark navy/charcoal header
  doc.rect(45, currentY, 505, 20).fill("#1e293b");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
  doc.text("QTY", 48, currentY + 6, { width: 30, align: "center" });
  doc.text("SERVICE / ITEM", 85, currentY + 6, { width: 145 });
  doc.text("SCOPE & SPECIFICATIONS", 235, currentY + 6, { width: 195 });
  doc.text("AMOUNT (KES)", 435, currentY + 6, { width: 110, align: "right" });

  currentY += 25;

  for (const item of items) {
    if (currentY > doc.page.height - 180) { doc.addPage(); currentY = 45; }

    doc.font("Helvetica").fillColor("#0f172a").fontSize(8.5);
    doc.text(Number(item.quantity || 1).toString(), 48, currentY, { width: 30, align: "center" });

    doc.font("Helvetica-Bold").text(item.title, 85, currentY, { width: 145 });
    const titleHeight = doc.heightOfString(item.title, { width: 145 });

    const specText = item.description || "Full OEM disassembly, component replacement, thermal validation, adhesive resealing, and stress testing.";
    doc.font("Helvetica").fillColor("#475569").fontSize(7.5).text(specText, 235, currentY, { width: 195 });
    const specHeight = doc.heightOfString(specText, { width: 195 });

    doc.font("Helvetica").fillColor("#0f172a").fontSize(8.5).text(formatCurrency(Number(item.total || item.unit_price || 0)), 435, currentY, { width: 110, align: "right" });

    const rowHeight = Math.max(18, titleHeight + 8, specHeight + 8);
    currentY += rowHeight;
    doc.rect(45, currentY - 3, 505, 0.5).fill("#e2e8f0");
  }

  // Total Estimated Cost Box
  doc.rect(45, currentY + 2, 505, 20).fill("#f8fafc");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  doc.text("Total Estimated Cost:", 300, currentY + 7, { width: 120, align: "right" });
  doc.text(formatCurrency(totals.totalEstimate), 435, currentY + 7, { width: 110, align: "right" });

  currentY += 34;

  // DIAGNOSTICS & TECHNICAL SUMMARY CARD
  if (currentY > doc.page.height - 160) { doc.addPage(); currentY = 45; }
  const diagCardY = currentY;
  const diagH = 75;
  doc.rect(45, diagCardY, 505, diagH).fill("#f8fafc");
  doc.rect(45, diagCardY, 3.5, diagH).fill("#1e3a8a");

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#1e3a8a").text("DIAGNOSTICS & TECHNICAL SUMMARY", 55, diagCardY + 8);
  
  let bY = diagCardY + 22;
  const drawBullet = (titleText: string, bodyText: string) => {
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0f172a").text(`• ${titleText}: `, 55, bY, { continued: true });
    doc.font("Helvetica").fillColor("#475569").text(bodyText, { width: 480 });
    bY += 16;
  };

  drawBullet("Hardware Assessment", ticket.issue_description || "Inspection confirmed hardware malfunction requiring bench service.");
  drawBullet("Bench & Component Measurements", "Thermal dissipation profile, logic rail voltages, and sub-assembly continuity verified.");
  drawBullet("Clearance Plan", "Component replacement and workshop clean-room installation under 90-day warranty.");

  currentY += diagH + 12;

  // LONG-TERM INFRASTRUCTURE RECOMMENDATION CARD
  if (currentY > doc.page.height - 120) { doc.addPage(); currentY = 45; }
  const recCardY = currentY;
  const recH = 65;
  doc.rect(45, recCardY, 505, recH).fill("#f0f7ff");
  doc.rect(45, recCardY, 3.5, recH).fill("#2563eb");

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#2563eb").text("LONG-TERM INFRASTRUCTURE RECOMMENDATION", 55, recCardY + 8);
  const recText = "While scheduled maintenance and OEM component replacement restores peak stability and operational hygiene, older hardware architectures face natural component obsolescence. We recommend periodic thermal de-dusting and evaluating phased upgrades to Apple Silicon or modern platforms.";
  doc.fontSize(7.5).font("Helvetica").fillColor("#1e293b").text(recText, 55, recCardY + 22, { width: 485, lineGap: 2 });

  currentY += recH + 14;

  doc.page.margins.bottom = 0;
  const footerY = doc.page.height - 40;
  doc.fontSize(7.5).font("Helvetica").fillColor("#94a3b8");
  doc.text(`Official Diagnostic & Scope Report — ${(settings?.company_name || "Urban Device Care Ltd")}`, 45, footerY, { lineBreak: false });
  doc.text("Page 1 of 1", 500, footerY, { align: "right", lineBreak: false });
}

// ---------------------------------------------------------------------------------
// 4. IT ASSET HANDOVER & INSPECTION REPORT LAYOUT (MATCHING SAMPLES)
// ---------------------------------------------------------------------------------
function renderHandoverReportDocument(
  doc: PDFKit.PDFDocument,
  ticket: any,
  customerName: string,
  settings: any,
  logoBuffer: Buffer | null
) {
  const leftX = 45;
  const topY = 40;

  // Logo on Left
  if (logoBuffer) {
    try { doc.image(logoBuffer, leftX, topY, { fit: [140, 48] }); } catch (e) {}
  } else {
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#111827").text(settings?.company_name || "URBAN DEVICE CARE LTD", leftX, topY);
  }

  // Company on Right
  const rightX = 320;
  let rY = topY;
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#0f172a").text(settings?.company_name || "Urban Device Care Ltd", rightX, rY, { width: 230, align: "right" });
  rY += 10;
  doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
  doc.text(settings?.pdf_address || "Bekim House, Westlands Crossway Road, Nairobi 00800, Kenya", rightX, rY, { width: 230, align: "right" });
  rY += doc.heightOfString(settings?.pdf_address || "Bekim House", { width: 230 }) + 2;
  doc.text(`Tel: ${settings?.pdf_phone || "0729436660 / 0794700241"}`, rightX, rY, { width: 230, align: "right" });
  rY += 9;
  doc.text(`Email: ${settings?.pdf_email || "info@urbandevicecare.co.uk"}`, rightX, rY, { width: 230, align: "right" });
  rY += 9;
  doc.font("Helvetica-Bold").text(`KRA PIN: ${settings?.kra_pin || "P052534849N"}`, rightX, rY, { width: 230, align: "right" });

  let currentY = Math.max(topY + 54, rY + 14);
  doc.rect(45, currentY, 505, 1.5).fill("#0f172a");
  currentY += 12;

  // Centered Header Banner Box
  doc.rect(45, currentY, 505, 24).fill("#f1f5f9");
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("IT ASSET HANDOVER & INSPECTION REPORT", 45, currentY + 7, { width: 505, align: "center", characterSpacing: 0.5 });
  currentY += 34;

  // Metadata: To, Subject, Date
  const drawMeta = (lbl: string, val: string) => {
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#0f172a").text(lbl, 45, currentY, { width: 60 });
    doc.font("Helvetica").fillColor("#334155").text(val, 110, currentY, { width: 440 });
    currentY += 13;
  };

  drawMeta("To:", customerName || "Company Administration / IT Department");
  drawMeta("Subject:", "End-of-Service / Custody Release Clearance");
  drawMeta("Date:", formatDate(ticket.created_at));
  currentY += 10;

  // 1. DEVICE INFORMATION (2x2 Cards Grid)
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("1. DEVICE INFORMATION", 45, currentY);
  currentY += 14;

  const cardW = 247;
  const cardH = 38;
  const cardRow1Y = currentY;
  const cardRow2Y = currentY + cardH + 8;
  const col2CardX = 45 + cardW + 11;

  const drawCard = (x: number, y: number, label: string, val: string) => {
    doc.roundedRect(x, y, cardW, cardH, 4).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#64748b").text(label, x + 10, y + 6);
    doc.fontSize(8.5).font("Helvetica").fillColor("#0f172a").text(val || "N/A", x + 10, y + 19, { width: cardW - 20, ellipsis: true });
  };

  const brandModel = `${ticket.device?.brand || ""} ${ticket.device?.model_name || "General Device"}`.trim();
  drawCard(45, cardRow1Y, "MODEL", brandModel);
  drawCard(col2CardX, cardRow1Y, "SERIAL NUMBER (SN)", ticket.device?.serial_number || ticket.device?.imei || "N/A");
  drawCard(45, cardRow2Y, "ACCESSORIES", ticket.accessories || "Standard power adapter and accessories");
  drawCard(col2CardX, cardRow2Y, "STORAGE & CONDITION", ticket.device?.condition || "Inspected & fully functional");

  currentY = cardRow2Y + cardH + 16;

  // 2. INSPECTION DETAILS (2 Cards)
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("2. INSPECTION DETAILS", 45, currentY);
  currentY += 14;

  drawCard(45, currentY, "ASSESSED BY (TECHNICIAN)", ticket.technician_name || "Bonifencia A.");
  drawCard(col2CardX, currentY, "TICKET / WORK ORDER", `RT-${ticket.ticket_number}`);
  currentY += cardH + 16;

  // 3. HARDWARE & SYSTEM DIAGNOSTIC (Bullet points checklist)
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("3. HARDWARE & SYSTEM DIAGNOSTIC", 45, currentY);
  currentY += 12;

  const drawCheckBullet = (title: string, desc: string) => {
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0f172a").text(`•  ${title}: `, 45, currentY, { continued: true });
    doc.font("Helvetica").fillColor("#475569").text(desc, { width: 505 });
    currentY += 13;
  };

  drawCheckBullet("Physical Condition", "Excellent. No structural damage, dents, or deep scratches observed on the chassis.");
  drawCheckBullet("Display", "Optimal. No dead pixels, discoloration, or cracks on the screen.");
  drawCheckBullet("Keyboard & Trackpad", "Fully functional. All keys respond correctly, and the trackpad is responsive with no lag.");
  drawCheckBullet("Ports & Connectivity", "All USB, HDMI, audio, and power delivery ports have been tested and are working correctly.");
  drawCheckBullet("Battery Health", "The battery holds normal charge and passes standard diagnostic health checks.");
  drawCheckBullet("Storage Drive", "Fully operational with no read/write errors detected.");

  currentY += 8;

  // 4. TECHNICIAN'S VERDICT
  doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("4. TECHNICIAN'S VERDICT", 45, currentY);
  currentY += 10;

  const verdictText = `I have thoroughly inspected the ${brandModel} listed above. The equipment is in complete working order, possesses no hardware faults, and is physically sound. It is officially cleared and deemed 'okay' for employee handover and custody release.`;
  const vH = doc.heightOfString(verdictText, { width: 485 }) + 16;

  doc.rect(45, currentY, 505, vH).fill("#f0fdf4");
  doc.rect(45, currentY, 3.5, vH).fill("#22c55e");
  doc.fontSize(7.5).font("Helvetica").fillColor("#166534").text(verdictText, 55, currentY + 8, { width: 485, lineGap: 2 });

  currentY += vH + 24;

  // Dual Signatures
  doc.rect(45, currentY, 200, 0.75).fill("#0f172a");
  doc.rect(310, currentY, 200, 0.75).fill("#0f172a");

  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#0f172a");
  doc.text(ticket.technician_name || "Bonifencia A.", 45, currentY + 5);
  doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text("Hardware Technician  •  Urban Device Care Ltd", 45, currentY + 16);

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text("IT Admin / Receiving Officer", 310, currentY + 5);
  doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text("Date & Official Stamp", 310, currentY + 16);

  doc.page.margins.bottom = 0;
  const footerY = doc.page.height - 35;
  doc.fontSize(7.5).font("Helvetica").fillColor("#94a3b8");
  doc.text(`${(settings?.company_name || "Urban Device Care Ltd")} — Device Clearance Report`, 45, footerY, { lineBreak: false });
  doc.text("Page 1 of 1", 500, footerY, { align: "right", lineBreak: false });
}

// ---------------------------------------------------------------------------------
// CENTRAL PDF BUFFER GENERATOR
// ---------------------------------------------------------------------------------
export async function generateRepairPdfBuffer(
  docType: string,
  ticket: any,
  customerName: string,
  settings: any,
  storeUrl?: string,
  templateStyle?: string
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margins: { top: 35, bottom: 25, left: 45, right: 45 },
        size: "A4",
      });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // 1. Resolve Items
      const items: any[] = [];
      if (ticket.device?.parts_used && Array.isArray(ticket.device.parts_used)) {
        for (const part of ticket.device.parts_used) {
          items.push({
            title: part.name || "Replacement Part",
            description: part.sku ? `SKU: ${part.sku}` : "",
            quantity: 1,
            unit_price: Number(part.price || 0),
            total: Number(part.price || 0),
          });
        }
      }
      if (ticket.parts && Array.isArray(ticket.parts)) {
        for (const p of ticket.parts) {
          const price = Number(p.prices?.[0]?.amount || 0);
          items.push({
            title: p.title || "Replacement Part",
            description: p.sku ? `SKU: ${p.sku}` : "",
            quantity: 1,
            unit_price: price,
            total: price,
          });
        }
      }
      if (ticket.custom_parts && Array.isArray(ticket.custom_parts)) {
        for (const cp of ticket.custom_parts) {
          items.push({
            title: cp.name || "Custom Part / Service",
            description: cp.description || "",
            quantity: 1,
            unit_price: Number(cp.price || 0),
            total: Number(cp.price || 0),
          });
        }
      }
      if (Number(ticket.labor_estimate || 0) > 0) {
        items.push({
          title: "Hardware Repair Labor & Bench Diagnostics",
          description: "Certified clean-room installation, logic rail testing & QC calibration",
          quantity: 1,
          unit_price: Number(ticket.labor_estimate),
          total: Number(ticket.labor_estimate),
        });
      }

      const totalEstimate = Number(ticket.total_actual && ticket.total_actual > 0 ? ticket.total_actual : ticket.total_estimate || 0);
      if (items.length === 0) {
        items.push({
          title: `Diagnostic & Repair Service (#${ticket.ticket_number})`,
          description: ticket.issue_description || "Hardware overhaul & bench repair",
          quantity: 1,
          unit_price: totalEstimate,
          total: totalEstimate,
        });
      }

      const amountPaid = Number(ticket.amount_paid || 0);
      const balanceDue = Math.max(0, totalEstimate - amountPaid);
      const totals = { totalEstimate, amountPaid, balanceDue };

      // 2. Resolve Logo Buffer
      const logoBuffer = await resolveLogoBuffer(settings?.pdf_logo_url);

      // 3. Resolve QR Code Buffer
      let qrBuffer: Buffer | null = null;
      try {
        const qrTarget = ticket.approval_token
          ? `${(storeUrl || "http://localhost:3000").replace(/\/$/, "")}/repairs/track?token=${ticket.approval_token}`
          : `${(storeUrl || "http://localhost:3000").replace(/\/$/, "")}/repairs/track?number=${ticket.ticket_number}`;
        qrBuffer = await QRCode.toBuffer(qrTarget, {
          errorCorrectionLevel: "H",
          type: "png",
          margin: 1,
          width: 60,
        });
      } catch (e) {}

      // 4. Payment Link text
      let paymentLinkText = "";
      if (balanceDue > 0 && ticket.approval_token && (docType === "invoice" || docType === "quote")) {
        const base = (storeUrl || process.env.STORE_URL || "http://localhost:3000").replace(/\/$/, "");
        paymentLinkText = `Pay Online: ${base}/repairs/track?token=${ticket.approval_token} | `;
      }

      // 5. Select Layout Engine
      const cleanType = (docType || "invoice").toLowerCase().trim();
      if (cleanType === "job_card") {
        renderJobCardDocument(doc, ticket, customerName, settings, items, totals, logoBuffer, qrBuffer);
      } else if (cleanType === "service_report" || cleanType === "diagnostic") {
        renderServiceReportDocument(doc, ticket, customerName, settings, items, totals, logoBuffer);
      } else if (cleanType === "handover") {
        renderHandoverReportDocument(doc, ticket, customerName, settings, logoBuffer);
      } else {
        // invoice, quote, receipt, or other
        renderZohoExactDocument(doc, cleanType, ticket, customerName, settings, items, totals, logoBuffer, qrBuffer, paymentLinkText);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------------
// CENTRAL CONTROLLER
// ---------------------------------------------------------------------------------
export async function generateRepairDocument(
  docType: string,
  ticket: any,
  customerName: string,
  res: MedusaResponse,
  req: MedusaRequest,
) {
  const repairService: RepairModuleService = req.scope.resolve(REPAIR_MODULE);
  const [settings] = await repairService.listRepairSettings({});
  const logger = req.scope.resolve("logger");

  let storeUrl = process.env.STORE_URL || "http://localhost:3000";
  if (settings?.storefront_url) {
    storeUrl = settings.storefront_url;
  }

  const cleanType = (docType || "job_card").toLowerCase().trim();

  // 0. If medusajs-documents-plugin is registered, check if document already exists or stream it directly
  const isZohoEnabled = Boolean(
    settings?.zoho_books_enabled &&
    settings.zoho_client_id &&
    settings.zoho_client_secret &&
    settings.zoho_refresh_token &&
    settings.zoho_organization_id &&
    ["invoice", "quote", "receipt"].includes(cleanType)
  );

  try {
    const docService: any = req.scope.resolve("documents", { allowUnregistered: true });
    if (docService) {
      const typeFilter = cleanType === "quote" ? "estimate" : cleanType;
      const docs = await docService.listDocumentRecords({
        repair_ticket_id: ticket.id,
        type: typeFilter,
      }).catch(() => []);
      if (docs && docs.length > 0) {
        docs.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const primaryDoc = docs[0];

        // Only serve cached record if Zoho is not enabled, or if the cached record is already an authentic Zoho record
        if (!isZohoEnabled || primaryDoc.source === "zoho" || primaryDoc.zoho_document_id) {
          const pdfBuf = await docService.getPdfForRecord(primaryDoc.id, req.scope).catch(() => null);
          if (pdfBuf) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${cleanType}-${ticket.ticket_number}.pdf"`);
            res.setHeader("Content-Length", String(pdfBuf.length));
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(pdfBuf);
          }
        }
      }
    }
  } catch (docErr: any) {
    logger?.warn?.(`[generateRepairDocument] Documents module check skipped: ${docErr.message}`);
  }

  // 1. If Zoho Books is enabled AND document is invoice, quote, or receipt, try Zoho integration
  if (
    settings?.zoho_books_enabled &&
    settings.zoho_client_id &&
    settings.zoho_client_secret &&
    settings.zoho_refresh_token &&
    settings.zoho_organization_id &&
    ["invoice", "quote", "receipt"].includes(cleanType)
  ) {
    const zoho = new ZohoBooksService(
      {
        client_id: settings.zoho_client_id,
        client_secret: settings.zoho_client_secret,
        refresh_token: settings.zoho_refresh_token,
        organization_id: settings.zoho_organization_id,
        domain: settings.zoho_domain || "com",
      },
      logger
    );

    try {
      let customerObj: any = { email: `guest-${ticket.id}@example.com`, first_name: customerName };
      if (ticket.customer_id) {
        const customerModule = req.scope.resolve("customer", { allowUnregistered: true });
        if (customerModule) {
          const c = await customerModule.retrieveCustomer(ticket.customer_id);
          if (c) customerObj = c;
        }
      }
      if (!customerObj.email && ticket.customer_email) customerObj.email = ticket.customer_email;
      if (!customerObj.phone && ticket.customer_phone) customerObj.phone = ticket.customer_phone;
      if (!customerObj.first_name && ticket.customer_name) customerObj.first_name = ticket.customer_name;

      const contactId = await zoho.syncContact(customerObj);
      const metadata = ticket.metadata || {};

      const targetTotal = (ticket.total_actual && ticket.total_actual > 0) ? ticket.total_actual : ticket.total_estimate;
      const balanceDue = Math.max(0, targetTotal - (ticket.amount_paid || 0));
      if (balanceDue > 0 && ticket.approval_token && (cleanType === "invoice" || cleanType === "quote")) {
        const sUrl = storeUrl.replace(/\/$/, "");
        const lUrl = `${sUrl}/repairs/track?token=${ticket.approval_token}`;
        const shortL = await getOrGenerateShortUrl(lUrl, repairService, sUrl);
        ticket._paymentLinkText = `Pay Online: ${shortL}`;
      }

      let docService: any = null;
      try {
        docService = req.scope.resolve("documents", { allowUnregistered: true });
      } catch (_) {}

      if (cleanType === "quote") {
        let estId = metadata.zoho_estimate_id as string;
        let pdfBuffer: ArrayBuffer | null = null;
        if (estId) {
          try {
            pdfBuffer = await zoho.getDocumentPdf(estId, "estimate");
          } catch (fetchErr: any) {
            logger?.warn?.(`[generateRepairDocument] Failed to fetch existing Zoho estimate ${estId}: ${fetchErr.message}. Creating fresh estimate.`);
            estId = "";
          }
        }
        if (!estId || !pdfBuffer) {
          estId = await zoho.createEstimate(contactId, ticket);
          await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_estimate_id: estId } });
          pdfBuffer = await zoho.getDocumentPdf(estId, "estimate");
        }
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, cleanType);

        if (docService) {
          try {
            const docs = await docService.listDocumentRecords({ repair_ticket_id: ticket.id, type: "estimate" }).catch(() => []);
            if (docs && docs.length > 0) {
              await docService.updateDocumentRecords({ id: docs[0].id, source: "zoho", zoho_document_id: estId }).catch(() => {});
            }
          } catch (_) {}
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Quote-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      } else if (cleanType === "receipt") {
        let paymentId = metadata.zoho_payment_id as string;
        let pdfBuffer: ArrayBuffer | null = null;
        if (paymentId) {
          try {
            pdfBuffer = await zoho.getPaymentReceiptPdf(paymentId);
          } catch (fetchErr: any) {
            logger?.warn?.(`[generateRepairDocument] Failed to fetch existing Zoho payment receipt ${paymentId}: ${fetchErr.message}.`);
            paymentId = "";
          }
        }
        if (!paymentId || !pdfBuffer) {
          let invId = metadata.zoho_invoice_id as string;
          if (!invId) {
            invId = await zoho.createInvoice(contactId, ticket);
            await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_invoice_id: invId } });
          }
          const amt = Number(ticket.amount_paid || targetTotal || 0);
          paymentId = await zoho.registerPayment(invId, amt, contactId, "Online", `RCPT-${ticket.ticket_number}`);
          await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_payment_id: paymentId, zoho_invoice_id: invId } });
          pdfBuffer = await zoho.getPaymentReceiptPdf(paymentId);
        }
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, cleanType);

        if (docService) {
          try {
            const docs = await docService.listDocumentRecords({ repair_ticket_id: ticket.id, type: "receipt" }).catch(() => []);
            if (docs && docs.length > 0) {
              await docService.updateDocumentRecords({ id: docs[0].id, source: "zoho", zoho_document_id: paymentId }).catch(() => {});
            }
          } catch (_) {}
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Receipt-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      } else if (cleanType === "invoice") {
        let invId = metadata.zoho_invoice_id as string;
        let pdfBuffer: ArrayBuffer | null = null;
        if (invId) {
          try {
            pdfBuffer = await zoho.getDocumentPdf(invId, "invoice");
          } catch (fetchErr: any) {
            logger?.warn?.(`[generateRepairDocument] Failed to fetch existing Zoho invoice ${invId}: ${fetchErr.message}. Creating fresh invoice.`);
            invId = "";
          }
        }
        if (!invId || !pdfBuffer) {
          invId = await zoho.createInvoice(contactId, ticket);
          await repairService.updateRepairTickets({ id: ticket.id, metadata: { ...metadata, zoho_invoice_id: invId } });
          pdfBuffer = await zoho.getDocumentPdf(invId, "invoice");
        }
        const modifiedBuffer = await postProcessZohoPdf(Buffer.from(pdfBuffer), ticket, cleanType);

        if (docService) {
          try {
            const docs = await docService.listDocumentRecords({ repair_ticket_id: ticket.id, type: "invoice" }).catch(() => []);
            if (docs && docs.length > 0) {
              await docService.updateDocumentRecords({ id: docs[0].id, source: "zoho", zoho_document_id: invId }).catch(() => {});
            }
          } catch (_) {}
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Repair-Invoice-${ticket.ticket_number}.pdf"`);
        return res.send(modifiedBuffer);
      }
    } catch (e: any) {
      logger?.warn?.(`[generateRepairDocument] Zoho Books sync failed, falling back to local PDFKit: ${e.message}`);
    }
  }

  // 2. High-Fidelity Local PDFKit Generation
  try {
    const pdfBuffer = await generateRepairPdfBuffer(cleanType, ticket, customerName, settings, storeUrl);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${cleanType}-${ticket.ticket_number}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger?.error?.(`[generateRepairDocument] Failed to generate PDF: ${error.message}`);
    res.status(500).json({ message: "Failed to generate PDF document", error: error.message });
  }
}
