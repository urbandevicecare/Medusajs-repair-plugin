export interface TemplatePayload {
  html: string;
  text: string;
}

export function getRepairTemplate(
  templateName: string,
  data: any,
): TemplatePayload {
  try {
    switch (templateName) {
      case "repair-status":
        return getRepairStatusTemplate(data);
      case "repair-created":
        return getRepairCreatedTemplate(data);
      case "repair-payment-receipt":
        return getRepairPaymentReceiptTemplate(data);
      case "repair-completed":
        return getRepairCompletedTemplate(data);
      case "repair-compliance":
        return getRepairComplianceTemplate(data);
      case "repair-reminder":
        return getRepairReminderTemplate(data);
      case "admin-repair-status":
        return getAdminRepairStatusTemplate(data);
      case "technician-assigned":
        return getTechnicianAssignedTemplate(data);
      case "technician-job-rejected":
        return getTechnicianJobRejectedTemplate(data);
      case "technician-job-paid":
        return getTechnicianJobPaidTemplate(data);
      default:
        console.warn(
          `[Template-Debug] ⚠️ Repair template '${templateName}' not found.`,
        );
        return {
          html: `<p>Repair notification update.</p>`,
          text: `Repair notification update.`,
        };
    }
  } catch (error) {
    console.error(
      `[Template-Debug] ❌ Error generating repair template '${templateName}'`,
      error,
    );
    throw error;
  }
}

function getRepairStatusTemplate(data: any) {
  const { ticket_number, status, device, total_estimate, approval_url } = data;
  const customerName = data.customer?.first_name || "Valued Customer";
  
  let text = `[${data.company_name || "Repair Shop"}] Hi ${customerName}, your repair #${ticket_number} (${device || "device"}) is: ${status.replace("_", " ")}.`;
  let html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-w-lg: 600px; margin: 0 auto;">
    <h2 style="color: #2563eb;">Repair Status Update</h2>
    <p>Dear ${customerName},</p>
    <p>The status of your repair ticket <strong>#${ticket_number}</strong> for your <strong>${device || "device"}</strong> has been updated to: <strong style="text-transform: capitalize;">${status.replace("_", " ")}</strong>.</p>`;

  if (total_estimate && Number(total_estimate) > 0) {
    const currency = data.currency_code || "USD";
    const formattedEstimate = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(Number(total_estimate));
    text += ` Cost: ${formattedEstimate}.`;
    html += `<div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
      <p style="margin: 0; font-size: 16px;"><strong>Estimated Total Cost:</strong> ${formattedEstimate}</p>
    </div>`;
  }

  if (data.pdf_url) {
    text += ` Doc: ${data.short_pdf_url || data.pdf_url}`;
    html += `<p style="margin-top: 15px;"><a href="${data.pdf_url}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">📄 Download PDF Document</a></p>`;
  }

  if (approval_url && status === "awaiting_approval") {
    const textApprovalUrl = data.short_approval_url || approval_url;
    const approveLink = textApprovalUrl.includes("?") ? `${textApprovalUrl}&action=approve` : `${textApprovalUrl}?action=approve`;
    const rejectLink = textApprovalUrl.includes("?") ? `${textApprovalUrl}&action=reject` : `${textApprovalUrl}?action=reject`;

    text += ` Approve: ${approveLink} or Reject: ${rejectLink}`;
    
    // HTML uses original long links
    const htmlApproveLink = approval_url.includes("?") ? `${approval_url}&action=approve` : `${approval_url}?action=approve`;
    const htmlRejectLink = approval_url.includes("?") ? `${approval_url}&action=reject` : `${approval_url}?action=reject`;
    
    html += `<p>Kindly review and approve or reject the repair costs so we can proceed:</p>
      <div style="margin-top: 25px; display: flex; gap: 10px;">
        <a href="${htmlApproveLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Approve Repair</a>
        <a href="${htmlRejectLink}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Reject</a>
      </div>`;
  } else if (approval_url) {
    text += ` Track: ${data.short_approval_url || approval_url}`;
    html += `<p style="margin-top: 25px;"><a href="${approval_url}" style="color: #2563eb; text-decoration: underline; font-weight: 500;">Track your repair progress here</a>.</p>`;
  }

  html += `<p style="margin-top: 30px;">Thank you for choosing us.</p>
    <p>Best Regards,<br/><strong>${data.company_name || "Repair Shop"}</strong></p>
  </div>`;

  return { html, text };
}

function getRepairComplianceTemplate(data: any) {
  const { ticket_number, device, compliance_url } = data;
  const customerName = data.customer?.first_name || "Valued Customer";
  
  const text = `[${data.company_name || "Repair Shop"}] Hi ${customerName}, please accept terms for repair #${ticket_number} (${device}) here: ${data.short_approval_url || compliance_url}`;

  const html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-w-lg: 600px; margin: 0 auto;">
    <h2 style="color: #d97706;">Action Required: Repair Ticket #${ticket_number}</h2>
    <p>Dear ${customerName},</p>
    <p>We require your consent to our Repair Terms & Conditions before we can proceed with diagnosing or repairing your <strong>${device}</strong>.</p>
    <p>Kindly review and accept the terms by clicking the secure link below:</p>
    <p style="margin-top: 25px;"><a href="${compliance_url}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review & Accept Terms</a></p>
    <p style="margin-top: 30px;">Thank you for your prompt action.</p>
    <p>Best Regards,<br/><strong>${data.company_name || "Repair Shop"}</strong></p>
  </div>`;

  return { html, text };
}

function getRepairReminderTemplate(data: any) {
  const { ticket_number, status, device, nudge_message, approval_url } = data;
  const customerName = data.customer?.first_name || "Valued Customer";

  const text = `[${data.company_name || "Repair Shop"}] Hi ${customerName}, Reminder for repair #${ticket_number} (${device}): ${nudge_message}. Track/Action: ${data.short_approval_url || approval_url}`;

  const html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-w-lg: 600px; margin: 0 auto;">
    <h2 style="color: #2563eb;">Repair Reminder: Ticket #${ticket_number}</h2>
    <p>Dear ${customerName},</p>
    <p>${nudge_message}</p>
    <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #64748b; margin: 20px 0;">
      <p style="margin: 0;"><strong>Device:</strong> ${device}</p>
      <p style="margin: 8px 0 0 0;"><strong>Status:</strong> <span style="text-transform: capitalize;">${status.replace("_", " ")}</span></p>
    </div>
    <p style="margin-top: 25px;"><a href="${approval_url}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">View Ticket</a></p>
    <p style="margin-top: 30px;">Thank you.</p>
    <p>Best Regards,<br/><strong>${data.company_name || "Repair Shop"}</strong></p>
  </div>`;

  return { html, text };
}

function getAdminRepairStatusTemplate(data: any) {
  const { ticket_number, status, customer_name, device } = data;
  const text = `[ADMIN ALERT] Repair Ticket #${ticket_number}\nCustomer: ${customer_name}\nDevice: ${device}\nNew Status: ${status.replace("_", " ")}`;
  const html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
    <h3 style="color: #dc2626; margin-bottom: 15px;">[ADMIN ALERT] Repair Status Changed</h3>
    <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; border: 1px solid #fecaca;">
      <ul style="list-style-type: none; padding: 0; margin: 0;">
        <li style="margin-bottom: 8px;"><strong>Ticket #:</strong> ${ticket_number}</li>
        <li style="margin-bottom: 8px;"><strong>Customer:</strong> ${customer_name}</li>
        <li style="margin-bottom: 8px;"><strong>Device:</strong> ${device}</li>
        <li><strong>New Status:</strong> <span style="text-transform: capitalize; color: #dc2626; font-weight: bold;">${status.replace("_", " ")}</span></li>
      </ul>
    </div>
  </div>`;

  return { html, text };
}

function getTechnicianAssignedTemplate(data: any): TemplatePayload {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">New Repair Job Assigned</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hello ${data.technician_name || "Technician"},</p>
        <p>A new repair job <strong>#${data.ticket_number}</strong> has been assigned to you.</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Job Details</h3>
          <p><strong>Ticket ID:</strong> ${data.repair_ticket_id}</p>
          <p><strong>Status:</strong> ${data.status}</p>
        </div>
        <p>Please log in to your dashboard to review the details and proceed with the diagnosis/repair.</p>
      </div>
    </div>
  `

  const text = `Hello ${data.technician_name || "Technician"},\n\nA new repair job #${data.ticket_number} has been assigned to you.\n\nTicket ID: ${data.repair_ticket_id}\nStatus: ${data.status}\n\nPlease log in to your dashboard to review the details.`

  return { html, text }
}

function getTechnicianJobRejectedTemplate(data: any): TemplatePayload {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Repair Job Cancelled</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hello ${data.technician_name || "Technician"},</p>
        <p>The cost estimate for repair job <strong>#${data.ticket_number}</strong> was rejected by the customer.</p>
        <p>This job has now been <strong>cancelled</strong> and requires no further action.</p>
      </div>
    </div>
  `

  const text = `Hello ${data.technician_name || "Technician"},\n\nThe cost estimate for repair job #${data.ticket_number} was rejected by the customer. This job has now been cancelled and requires no further action.`

  return { html, text }
}

function getTechnicianJobPaidTemplate(data: any): TemplatePayload {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Repair Job Paid</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hello ${data.technician_name || "Technician"},</p>
        <p>The repair job <strong>#${data.ticket_number}</strong> has been successfully paid for by the customer.</p>
        <p>You may now proceed to finalize the repair if it is not already completed.</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Job Details</h3>
          <p><strong>Ticket ID:</strong> ${data.repair_ticket_id}</p>
          <p><strong>Status:</strong> ${data.status}</p>
        </div>
      </div>
    </div>
  `

  const text = `Hello ${data.technician_name || "Technician"},\n\nThe repair job #${data.ticket_number} has been successfully paid for by the customer.\nYou may now proceed to finalize the repair.\n\nTicket ID: ${data.repair_ticket_id}\nStatus: ${data.status}`

  return { html, text }
}

function getRepairCreatedTemplate(data: any): TemplatePayload {
  const { ticket_number, device, approval_url } = data;
  const customerName = data.customer?.first_name || "Valued Customer";
  const company = data.company_name || "Repair Shop";

  let text = `[${company}] Hi ${customerName}, your repair ticket #${ticket_number} for ${device || "device"} has been received. Track progress: ${data.short_approval_url || approval_url}`;
  if (data.short_pdf_url || data.pdf_url) {
    text += ` | Job Card: ${data.short_pdf_url || data.pdf_url}`;
  }

  let html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #2563eb;">Repair Intake Confirmation</h2>
    <p>Dear ${customerName},</p>
    <p>Thank you for choosing us. Your repair ticket <strong>#${ticket_number}</strong> for <strong>${device || "device"}</strong> has been logged into our workshop.</p>
    <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
      <p style="margin: 0;"><strong>Ticket Number:</strong> #${ticket_number}</p>
      <p style="margin: 8px 0 0 0;"><strong>Device:</strong> ${device || "Device"}</p>
      <p style="margin: 8px 0 0 0;"><strong>Status:</strong> Intake Confirmed / In Queue</p>
    </div>`;

  if (data.pdf_url) {
    html += `<p style="margin-top: 15px;"><a href="${data.pdf_url}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">📋 Download Intake Job Card (PDF)</a></p>`;
  }

  if (approval_url) {
    html += `<p style="margin-top: 20px;"><a href="${approval_url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Track Repair Online</a></p>`;
  }

  html += `<p style="margin-top: 30px;">Thank you for trusting us with your equipment.</p>
    <p>Best Regards,<br/><strong>${company}</strong></p>
  </div>`;

  return { html, text };
}

function getRepairPaymentReceiptTemplate(data: any): TemplatePayload {
  const { ticket_number, device, approval_url, total_estimate } = data;
  const customerName = data.customer?.first_name || "Valued Customer";
  const company = data.company_name || "Repair Shop";

  let text = `[${company}] Hi ${customerName}, payment received for repair #${ticket_number} (${device || "device"}). Thank you!`;
  if (data.short_pdf_url || data.pdf_url) {
    text += ` | Receipt: ${data.short_pdf_url || data.pdf_url}`;
  }

  let html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #16a34a;">Payment Receipt Confirmation</h2>
    <p>Dear ${customerName},</p>
    <p>We have successfully received and confirmed your payment for repair ticket <strong>#${ticket_number}</strong> (${device || "device"}).</p>
    <div style="background-color: #f0fdf4; padding: 15px; border-left: 4px solid #16a34a; margin: 20px 0;">
      <p style="margin: 0; color: #166534; font-size: 16px;"><strong>Payment Status:</strong> PAID IN FULL</p>
      ${total_estimate ? `<p style="margin: 8px 0 0 0; color: #166534;"><strong>Amount:</strong> ${typeof total_estimate === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code || "USD" }).format(total_estimate) : total_estimate}</p>` : ""}
    </div>`;

  if (data.pdf_url) {
    html += `<p style="margin-top: 15px;"><a href="${data.pdf_url}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">💳 Download Payment Receipt (PDF)</a></p>`;
  }

  if (approval_url) {
    html += `<p style="margin-top: 20px;"><a href="${approval_url}" style="color: #2563eb; text-decoration: underline;">View repair details online</a>.</p>`;
  }

  html += `<p style="margin-top: 30px;">Thank you for your business.</p>
    <p>Best Regards,<br/><strong>${company}</strong></p>
  </div>`;

  return { html, text };
}

function getRepairCompletedTemplate(data: any): TemplatePayload {
  const { ticket_number, device, approval_url } = data;
  const customerName = data.customer?.first_name || "Valued Customer";
  const company = data.company_name || "Repair Shop";

  let text = `[${company}] Hi ${customerName}, repair #${ticket_number} (${device || "device"}) is now completed! Ready for collection/delivery.`;
  if (data.short_approval_url || approval_url) {
    text += ` Details: ${data.short_approval_url || approval_url}`;
  }
  if (data.short_pdf_url || data.pdf_url) {
    text += ` | Document: ${data.short_pdf_url || data.pdf_url}`;
  }

  let html = `<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #2563eb;">Repair Completed & Ready</h2>
    <p>Dear ${customerName},</p>
    <p>Great news! Repair work on your <strong>${device || "device"}</strong> (Ticket <strong>#${ticket_number}</strong>) has been completed and verified by our technicians.</p>
    <div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
      <p style="margin: 0; color: #1e40af; font-size: 16px;"><strong>Status:</strong> Ready for Collection / Delivery</p>
      <p style="margin: 8px 0 0 0; color: #1e40af;">Your device has passed post-repair diagnostic stress tests and hardware inspection.</p>
    </div>`;

  if (data.pdf_url) {
    html += `<p style="margin-top: 15px;"><a href="${data.pdf_url}" style="color: #2563eb; font-weight: bold; text-decoration: underline;">📄 Download Official Invoice / Report (PDF)</a></p>`;
  }

  if (approval_url) {
    html += `<p style="margin-top: 20px;"><a href="${approval_url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review Repair & Collection Details</a></p>`;
  }

  html += `<p style="margin-top: 30px;">Thank you for your trust and patience.</p>
    <p>Best Regards,<br/><strong>${company}</strong></p>
  </div>`;

  return { html, text };
}
