import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils";
import { getRepairTemplate } from "../utils/templates/repair";
import { REPAIR_MODULE } from "../modules/repair";
import RepairModuleService from "../modules/repair/service";

// Customer milestone statuses that warrant customer notifications
const CUSTOMER_MILESTONES = [
  "received",
  "awaiting_approval",
  "ready",
  "completed",
  "cancelled",
];

// High-cost SMS is restricted strictly to customer-action milestones
const SMS_CUSTOMER_ACTION_MILESTONES = [
  "awaiting_approval",
  "ready",
  "cancelled",
];

function interpolateMergeTags(template: string, tags: Record<string, string>): string {
  if (!template) return template;
  return template.replace(/\{(\w+)\}/g, (match, tagKey) => {
    return tags[tagKey] !== undefined ? tags[tagKey] : match;
  });
}

async function shortenUrl(url: string, container: any): Promise<string> {
  if (!url) return url;
  try {
    const repairModule: any = container.resolve("repair");
    
    let storeUrl = process.env.STORE_URL || "http://localhost:3000";
    try {
      const [settings] = await repairModule.listRepairSettings({});
      if (settings && settings.storefront_url) {
        storeUrl = settings.storefront_url;
      }
    } catch (e) {}
    storeUrl = storeUrl.replace(/\/$/, "");

    try {
      const existing = await repairModule.listRepairLinks({ url });
      if (existing && existing.length > 0) {
        return `${storeUrl}/r/${existing[0].shortcode}`;
      }
    } catch (e) {}

    const shortcode = Math.random().toString(36).substring(2, 8);
    await repairModule.createRepairLinks({
      shortcode,
      url,
    });
    
    return `${storeUrl}/r/${shortcode}`;
  } catch (e) {
    return url;
  }
}

export default async function globalNotificationHandler({
  event,
  container,
}: SubscriberArgs<any>) {
  const logger = container.resolve("logger");
  const eventName = event.name;
  const data = event.data;

  logger.info(`[Omni-Notify] 🟢 Triggered '${eventName}' subscriber.`);

  try {
    const notificationModuleService = container.resolve(
      ModuleRegistrationName.NOTIFICATION,
      { allowUnregistered: true },
    );
    if (!notificationModuleService) {
      logger.warn(
        `[Omni-Notify] ⚠️ Notification module not installed. Aborting.`,
      );
      return;
    }

    const repairService: RepairModuleService = container.resolve(REPAIR_MODULE);
    const [settings] = await repairService.listRepairSettings({});
    
    const ACTIVE_CHANNELS: string[] = [];
    if (!settings || settings.email_notifications_enabled) ACTIVE_CHANNELS.push("email");
    if (!settings || settings.sms_notifications_enabled) ACTIVE_CHANNELS.push("sms");
    // WhatsApp is disabled by default to avoid unhandled provider errors in Medusa
    if (settings?.whatsapp_notifications_enabled === true) ACTIVE_CHANNELS.push("whatsapp");

    if (ACTIVE_CHANNELS.length === 0) {
      logger.info(`[Omni-Notify] All notification channels disabled in settings. Aborting.`);
      return;
    }

    let targetEmail: string | null = null;
    let targetPhone: string | null = null;

    let baseTemplateName = "";
    let notificationSubject = "";
    let emailHtmlContent = "";
    let textContent = "";
    let whatsappContent = "";
    let notificationData: Record<string, any> = {};
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    let customerName = "Customer";

    // ---------------------------------------------------------
    // REPAIR EVENT FLOW
    // ---------------------------------------------------------
    if (eventName.startsWith("repair.")) {
      const ticketId = data.id || data.repair_ticket_id;
      if (!ticketId) {
        logger.warn(
          `[Omni-Notify] ⚠️ No ticket ID found in event data. Aborting.`,
        );
        return;
      }

      logger.debug(
        `[Omni-Notify] Retrieving ticket data for ID: ${ticketId}...`,
      );
      const { data: tickets } = await query.graph({
        entity: "repair_ticket",
        fields: ["*", "device.*"],
        filters: { id: ticketId },
      });

      if (!tickets || tickets.length === 0) {
        logger.warn(`[Omni-Notify] ⚠️ Repair ticket ${ticketId} not found`);
        return;
      }

      const ticket = tickets[0];
      const deviceModel = ticket.device?.model_name || "Device";
      const rawStatus = String(data.status || ticket.status || "").toLowerCase().trim();

      let storeUrl = process.env.STORE_URL || "http://localhost:3000";
      let companyName = "Urban Device Care Ltd";
      try {
        if (settings) {
          if (settings.storefront_url) storeUrl = settings.storefront_url;
          if (settings.company_name) companyName = settings.company_name;
        }
      } catch (e) {}

      storeUrl = storeUrl.replace(/\/$/, "");

      const approvalUrl = ticket.approval_token
        ? `${storeUrl}/repairs/track?token=${ticket.approval_token}`
        : "";

      // Attempt to load customer details
      if (ticket.customer_id) {
        const customerModule = container.resolve(
          ModuleRegistrationName.CUSTOMER,
          { allowUnregistered: true },
        );
        if (customerModule) {
          const customer = await customerModule.retrieveCustomer(
            ticket.customer_id,
          );
          if (customer) {
            targetEmail = customer.email || null;
            targetPhone = customer.phone || null;
            customerName = customer.first_name || customer.email || "Customer";
            notificationData.customer = customer;
          }
        }
      }

      let currencyCode = "usd";
      try {
        const regionModule = container.resolve(Modules.REGION, { allowUnregistered: true });
        if (regionModule) {
          const regions = await regionModule.listRegions({}, { take: 1 });
          if (regions && regions.length > 0) {
            currencyCode = regions[0].currency_code;
          }
        }
      } catch (e) {}

      // ---------------------------------------------------------
      // DOCUMENT LINK HANDOVER & RESOLUTION
      // ---------------------------------------------------------
      let expectedType: string | undefined = undefined;
      if (eventName === "repair.payment_received" || ticket.payment_status === "captured" || ticket.payment_status === "paid") {
        expectedType = "receipt";
      } else if (eventName === "repair.created" || rawStatus === "received") {
        expectedType = "job_card";
      } else if (rawStatus === "awaiting_approval") {
        expectedType = "estimate";
      }

      let pdfUrl = "";
      let shortPdfUrl = "";

      // 1. Handover link from ticket metadata if matching expected document type
      const metaDocType = (ticket.metadata as any)?.last_document_type;
      if (metaDocType && expectedType && metaDocType === expectedType) {
        pdfUrl = (ticket.metadata as any)?.pdf_url || "";
        shortPdfUrl = (ticket.metadata as any)?.short_pdf_link || "";
      } else if (!expectedType && (ticket.metadata as any)?.pdf_url) {
        pdfUrl = (ticket.metadata as any)?.pdf_url || "";
        shortPdfUrl = (ticket.metadata as any)?.short_pdf_link || "";
      }

      // 2. Query documents module directly if registered in Medusa container
      if (!pdfUrl) {
        try {
          const docModule: any = container.resolve("documents", { allowUnregistered: true });
          if (docModule) {
            const queryFilter: any = { repair_ticket_id: ticket.id };
            if (expectedType) {
              queryFilter.type = expectedType;
            }
            let docs = await docModule.listDocumentRecords(queryFilter).catch(() => []);
            if ((!docs || docs.length === 0) && expectedType) {
              docs = await docModule.listDocumentRecords({ repair_ticket_id: ticket.id }).catch(() => []);
            }
            if (docs && docs.length > 0) {
              docs.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
              const latestDoc = docs[0];
              pdfUrl = latestDoc.pdf_url || "";
              shortPdfUrl = latestDoc.short_pdf_link || latestDoc.pdf_url || "";
            }
          }
        } catch (e) {}
      }

      // 3. Fallback to generic metadata link if still unresolved
      if (!pdfUrl && (ticket.metadata as any)?.pdf_url) {
        pdfUrl = (ticket.metadata as any).pdf_url;
        shortPdfUrl = (ticket.metadata as any).short_pdf_link || pdfUrl;
      }

      // 4. Fallback to repair plugin's native secure token endpoint
      if (!pdfUrl && ticket.approval_token) {
        let docTypeParam = "invoice";
        if (eventName === "repair.created" || rawStatus === "received") docTypeParam = "job_card";
        else if (eventName === "repair.payment_received" || ticket.payment_status === "captured" || ticket.payment_status === "paid" || rawStatus === "completed") docTypeParam = "receipt";
        else if (rawStatus === "awaiting_approval") docTypeParam = "quote";

        pdfUrl = `${storeUrl}/api/repairs/token/${ticket.approval_token}/document?type=${docTypeParam}`;
      }

      const shortApprovalUrl = await shortenUrl(approvalUrl, container);
      if (!shortPdfUrl && pdfUrl) {
        shortPdfUrl = await shortenUrl(pdfUrl, container);
      }
      const totalEstimateNum = Number((ticket.total_estimate as any)?.value ?? ticket.total_estimate ?? 0);

      const formattedEstimate = totalEstimateNum > 0
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode.toUpperCase(),
          }).format(totalEstimateNum)
        : "";

      let formattedStatus = rawStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (eventName === "repair.payment_received") {
        formattedStatus = "Paid";
      }

      // Populate base data
      notificationData = {
        ...notificationData,
        customer_name: customerName,
        ticket_number: ticket.ticket_number,
        device: deviceModel,
        status: rawStatus,
        approval_url: approvalUrl,
        short_approval_url: shortApprovalUrl,
        pdf_url: pdfUrl,
        short_pdf_url: shortPdfUrl,
        currency_code: currencyCode.toUpperCase(),
        company_name: companyName,
        total_estimate: totalEstimateNum,
      };

      // ---------------------------------------------------------
      // EVENT ROUTING: STATUS FILTERING & ADMIN ALERT
      // ---------------------------------------------------------
      if (eventName === "repair.status_changed") {
        baseTemplateName = "repair-status";
        notificationSubject = `${companyName}: Repair Status Update - ${deviceModel} (#${ticket.ticket_number})`;

        // Fire internal Admin notification
        if (notificationModuleService) {
          const adminTemplate = getRepairTemplate("admin-repair-status", {
            ...notificationData,
            customer_name: customerName,
          });
          logger.debug(`[Omni-Notify] 🛡️ Queuing internal Admin Notification`);
          notificationModuleService
            .createNotifications({
              to: "admin",
              channel: "admin",
              template: "admin-repair-status",
              content: {
                subject: `[Admin Alert] Status Changed: Ticket ${ticket.ticket_number} -> ${rawStatus}`,
                html: adminTemplate.html,
              },
              data: { ...notificationData, body: adminTemplate.text },
            })
            .catch((e) =>
              logger.warn(
                `[Omni-Notify] Admin notification failed: ${e.message}`,
              ),
            );
        }

        // Check if milestone warrants customer push notification
        if (!CUSTOMER_MILESTONES.includes(rawStatus)) {
          logger.info(
            `[Omni-Notify] ⏸️ Status '${rawStatus}' is an internal bench state (e.g. diagnosing/repairing). Skipping customer push notifications.`
          );
          return;
        }
      } else if (eventName === "repair.created") {
        baseTemplateName = "repair-created";
        notificationSubject = `${companyName}: Repair Intake Confirmation - ${deviceModel} (#${ticket.ticket_number})`;
      } else if (eventName === "repair.payment_received") {
        baseTemplateName = "repair-payment-receipt";
        notificationSubject = `${companyName}: Payment Receipt - ${deviceModel} (#${ticket.ticket_number})`;
        notificationData.status = "paid";
      } else if (eventName === "repair.completed") {
        baseTemplateName = "repair-completed";
        notificationSubject = `${companyName}: Repair Completed & Ready - ${deviceModel} (#${ticket.ticket_number})`;
        notificationData.status = "completed";
      } else if (eventName === "repair.ticket.compliance_requested") {
        baseTemplateName = "repair-compliance";
        notificationSubject = `Action Required: Repair Ticket #${ticket.ticket_number}`;
        notificationData.compliance_url = approvalUrl;
      } else if (eventName === "repair.customer_reminder") {
        baseTemplateName = "repair-reminder";
        notificationSubject = `Reminder: Repair Ticket #${ticket.ticket_number}`;
        let nudgeMessage = "Please review the status of your repair.";
        if (rawStatus === "awaiting_approval") {
          nudgeMessage = "We are waiting for your approval to proceed with the repair.";
        } else if (rawStatus === "completed" || rawStatus === "ready") {
          nudgeMessage = "Your device is ready for pickup or payment.";
        }
        notificationData.nudge_message = nudgeMessage;
      }

      // Default fallback templates
      const defaultTemplate = getRepairTemplate(baseTemplateName, notificationData);
      emailHtmlContent = defaultTemplate.html;
      textContent = defaultTemplate.text;
      whatsappContent = defaultTemplate.text;

      // ---------------------------------------------------------
      // CUSTOM TEMPLATE MERGE TAG INTERPOLATION
      // ---------------------------------------------------------
      const mergeTags: Record<string, string> = {
        customer_name: customerName,
        ticket_number: String(ticket.ticket_number),
        device: deviceModel,
        status: formattedStatus,
        approval_url: approvalUrl,
        short_approval_url: shortApprovalUrl,
        total_estimate: formattedEstimate,
        company_name: companyName,
        pdf_url: pdfUrl,
        short_pdf_url: shortPdfUrl,
        nudge_message: notificationData.nudge_message || "",
        payment_button: approvalUrl
          ? `<div style="margin: 20px 0;"><a href="${approvalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Review & Pay Online</a></div>`
          : "",
        download_button: pdfUrl
          ? `<div style="margin: 20px 0;"><a href="${pdfUrl}" style="background-color: #1f2937; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">📄 Download PDF Document</a></div>`
          : "",
      };

      if (settings?.email_subject_template?.trim()) {
        notificationSubject = interpolateMergeTags(settings.email_subject_template, mergeTags);
      }
      if (settings?.email_body_template?.trim()) {
        emailHtmlContent = interpolateMergeTags(settings.email_body_template, mergeTags);
      }
      if (settings?.sms_body_template?.trim()) {
        textContent = interpolateMergeTags(settings.sms_body_template, mergeTags);
      }
      if (settings?.whatsapp_body_template?.trim()) {
        whatsappContent = interpolateMergeTags(settings.whatsapp_body_template, mergeTags);
      }
    } else {
      logger.warn(`[Omni-Notify] ⚠️ Unmapped event '${eventName}'. Aborting.`);
      return;
    }

    // ---------------------------------------------------------
    // MULTI-CHANNEL DISPATCH PREPARATION
    // ---------------------------------------------------------
    if (!targetEmail && !targetPhone) {
      logger.warn(
        `[Omni-Notify] ⚠️ No contact methods (email/phone) found for event ${eventName}. Aborting.`,
      );
      return;
    }

    logger.debug(
      `[Omni-Notify] Preparing omni-channel dispatch for '${baseTemplateName}'...`,
    );
    const dispatches: Promise<any>[] = [];

    // 1. Queue Email (Allowed for all customer milestones)
    if (ACTIVE_CHANNELS.includes("email") && targetEmail) {
      logger.debug(`[Omni-Notify] 📧 Queuing Email to ${targetEmail}`);
      dispatches.push(
        notificationModuleService.createNotifications({
          to: targetEmail,
          channel: "email",
          template: `${baseTemplateName}-email`,
          content: {
            subject: notificationSubject,
            html: emailHtmlContent,
          },
          data: notificationData,
        }),
      );
    }

    // 2. Queue SMS (Restricted strictly to milestones requiring customer action)
    const isSmsActionMilestone = SMS_CUSTOMER_ACTION_MILESTONES.includes(String(notificationData.status || "").toLowerCase().trim());
    const isSmsPermitted =
      eventName === "repair.customer_reminder" ||
      eventName === "repair.ticket.compliance_requested" ||
      (eventName === "repair.status_changed" && isSmsActionMilestone);

    if (ACTIVE_CHANNELS.includes("sms") && targetPhone && isSmsPermitted) {
      logger.debug(`[Omni-Notify] 📱 Queuing SMS to ${targetPhone}`);
      dispatches.push(
        notificationModuleService.createNotifications({
          to: targetPhone,
          channel: "sms",
          template: `${baseTemplateName}-sms`,
          data: {
            ...notificationData,
            body: textContent,
            text: textContent,
          },
        }),
      );
    } else if (ACTIVE_CHANNELS.includes("sms") && targetPhone && !isSmsPermitted) {
      logger.debug(
        `[Omni-Notify] ℹ️ Skipping high-cost SMS for non-action event/milestone '${eventName}' / '${notificationData.status}'. Customer action not required.`
      );
    }

    // 3. Queue WhatsApp (Strictly opt-in, disabled by default)
    if (ACTIVE_CHANNELS.includes("whatsapp") && targetPhone) {
      logger.debug(`[Omni-Notify] 💬 Queuing WhatsApp to ${targetPhone}`);
      dispatches.push(
        notificationModuleService.createNotifications({
          to: targetPhone,
          channel: "whatsapp",
          template: `${baseTemplateName}-whatsapp`,
          data: {
            ...notificationData,
            body: whatsappContent,
            text: whatsappContent,
          },
        }),
      );
    }

    await Promise.allSettled(dispatches);
    logger.info(
      `[Omni-Notify] ✅ Successfully executed ${dispatches.length} notification(s) for '${eventName}'.`,
    );
  } catch (error) {
    logger.error(`[Omni-Notify] ❌ Failed to process '${eventName}'`, error);
  }
}

export const config: SubscriberConfig = {
  event: [
    "repair.status_changed",
    "repair.ticket.compliance_requested",
    "repair.customer_reminder",
    "repair.created",
    "repair.completed",
    "repair.payment_received",
  ],
};
