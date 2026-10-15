import { test } from "node:test";
import assert from "node:assert";
import globalNotificationHandler from "../src/subscribers/notifications";
import { generateRepairPdfBuffer } from "../src/utils/generate-repair-document";
import { getRepairTemplate } from "../src/utils/templates/repair";

// Mock helper to create container
function createMockContainer(opts: {
  ticket: any;
  settings?: any;
  documentsModule?: any;
}) {
  const dispatchedNotifications: any[] = [];
  const linksCreated: any[] = [];

  const mockNotificationService = {
    createNotifications: async (payload: any) => {
      dispatchedNotifications.push(payload);
      return { id: "notif_" + Math.random().toString(36).substring(2, 7) };
    },
  };

  const mockRepairService = {
    listRepairSettings: async () => [opts.settings || {
      email_notifications_enabled: true,
      sms_notifications_enabled: true,
      whatsapp_notifications_enabled: false,
      company_name: "Urban Device Care Ltd",
    }],
    listRepairLinks: async (filter: any) => [],
    createRepairLinks: async (link: any) => {
      linksCreated.push(link);
      return link;
    },
  };

  const mockQuery = {
    graph: async () => ({
      data: [opts.ticket],
    }),
  };

  const mockCustomerModule = {
    retrieveCustomer: async (id: string) => ({
      id,
      first_name: "Nelson",
      last_name: "Owalo",
      email: "nelson@example.com",
      phone: "+254700112233",
    }),
  };

  const container: any = {
    resolve: (key: string, options?: any) => {
      if (key === "logger") {
        return {
          info: () => {},
          debug: () => {},
          warn: () => {},
          error: () => {},
        };
      }
      if (key === "notification") return mockNotificationService;
      if (key === "repair") return mockRepairService;
      if (key === "query") return mockQuery;
      if (key === "customer") return mockCustomerModule;
      if (key === "documents") return opts.documentsModule || null;
      if (key === "region") {
        return {
          listRegions: async () => [{ currency_code: "usd" }],
        };
      }
      return null;
    },
  };

  return { container, dispatchedNotifications, linksCreated };
}

test("Requirement 1: Internal bench statuses (diagnosing/repairing) suppress customer notifications and alert admin", async () => {
  const sampleTicket = {
    id: "rep_bench_01",
    ticket_number: 101,
    status: "diagnosing",
    approval_token: "tok_test_01",
    customer_id: "cus_01",
    device: { model_name: "MacBook Pro M2" },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_bench_01", status: "diagnosing" } },
    container,
  } as any);

  // Admin should be alerted of the bench status change
  const adminAlert = dispatchedNotifications.find((n) => n.channel === "admin");
  assert.ok(adminAlert, "Internal bench status MUST trigger an Admin notification alert");
  assert.ok(adminAlert.content.subject.includes("diagnosing"), "Admin subject must include status");

  // Customer should NOT receive email or SMS
  const customerNotifications = dispatchedNotifications.filter((n) => n.channel !== "admin");
  assert.strictEqual(
    customerNotifications.length,
    0,
    "Internal bench status (diagnosing) MUST NOT send any notifications to the customer"
  );
});

test("Requirement 1: Milestone awaiting_approval sends Email and SMS (Actionable Milestone)", async () => {
  const sampleTicket = {
    id: "rep_action_01",
    ticket_number: 102,
    status: "awaiting_approval",
    approval_token: "tok_test_02",
    customer_id: "cus_01",
    total_estimate: 250,
    device: { model_name: "iPhone 15 Pro" },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_action_01", status: "awaiting_approval" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  const smsNotif = dispatchedNotifications.find((n) => n.channel === "sms");

  assert.ok(emailNotif, "Customer must receive email for awaiting_approval");
  assert.ok(smsNotif, "Customer must receive SMS for awaiting_approval (action milestone)");
  assert.strictEqual(emailNotif.to, "nelson@example.com");
  assert.strictEqual(smsNotif.to, "+254700112233");
});

test("Requirement 1: Non-action milestone (received/completed) sends Email but suppresses high-cost SMS", async () => {
  const sampleTicket = {
    id: "rep_milestone_02",
    ticket_number: 103,
    status: "received",
    approval_token: "tok_test_03",
    customer_id: "cus_01",
    device: { model_name: "Samsung Galaxy S23" },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_milestone_02", status: "received" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  const smsNotif = dispatchedNotifications.find((n) => n.channel === "sms");

  assert.ok(emailNotif, "Customer must receive email for received status milestone");
  assert.strictEqual(smsNotif, undefined, "High-cost SMS must be suppressed for non-action milestone 'received'");
});

test("Requirement 1 & Handover: Handed over document link from medusajs-documents-plugin is embedded in notification", async () => {
  const handedOverPdfUrl = "http://localhost:3000/api/admin/documents/doc_ho_01/document";
  const handedOverShortLink = "http://localhost:3000/r/ho01";

  const sampleTicket = {
    id: "rep_handover_01",
    ticket_number: 104,
    status: "ready",
    approval_token: "tok_test_04",
    customer_id: "cus_01",
    device: { model_name: "iPad Pro" },
    metadata: {
      pdf_url: handedOverPdfUrl,
      short_pdf_link: handedOverShortLink,
      document_id: "doc_ho_01",
    },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_handover_01", status: "ready" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  assert.ok(emailNotif, "Email must be queued");
  assert.strictEqual(emailNotif.data.pdf_url, handedOverPdfUrl);
  assert.strictEqual(emailNotif.data.short_pdf_url, handedOverShortLink);
  assert.ok(emailNotif.content.html.includes(handedOverPdfUrl), "HTML must embed the handed-over document link");
});

test("Requirement 1 & Handover: Queries documents module for latest record if not directly on ticket metadata", async () => {
  const handedOverPdfUrl = "http://localhost:3000/api/admin/documents/doc_queried_01/document";
  const handedOverShortLink = "http://localhost:3000/r/q01";

  const sampleTicket = {
    id: "rep_doc_query_01",
    ticket_number: 105,
    status: "ready",
    approval_token: "tok_test_05",
    customer_id: "cus_01",
    device: { model_name: "Dell XPS 15" },
    metadata: {},
  };

  const mockDocumentsModule = {
    listDocumentRecords: async (filter: any) => [
      {
        id: "doc_queried_01",
        pdf_url: handedOverPdfUrl,
        short_pdf_link: handedOverShortLink,
        created_at: new Date().toISOString(),
      },
    ],
  };

  const { container, dispatchedNotifications } = createMockContainer({
    ticket: sampleTicket,
    documentsModule: mockDocumentsModule,
  });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_doc_query_01", status: "ready" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  assert.ok(emailNotif, "Email must be queued");
  assert.strictEqual(emailNotif.data.pdf_url, handedOverPdfUrl);
  assert.strictEqual(emailNotif.data.short_pdf_url, handedOverShortLink);
});

test("Requirement 3: Notification templates editable in settings with merge tags are correctly interpolated", async () => {
  const customSettings = {
    email_notifications_enabled: true,
    sms_notifications_enabled: true,
    whatsapp_notifications_enabled: false,
    company_name: "Apex Electronics",
    email_subject_template: "Update on {device} ({ticket_number}): {status}",
    email_body_template: "Hello {customer_name}, your {device} is now {status}. Approval link: {approval_url}. PDF: {pdf_url}",
    sms_body_template: "{customer_name}: {device} #{ticket_number} is {status}. Total: {total_estimate}. Link: {short_approval_url}",
  };

  const sampleTicket = {
    id: "rep_merge_01",
    ticket_number: 106,
    status: "awaiting_approval",
    approval_token: "tok_approval_999",
    customer_id: "cus_01",
    total_estimate: 350,
    device: { model_name: "Google Pixel 8" },
    metadata: {
      pdf_url: "http://localhost:3000/docs/invoice-106.pdf",
    },
  };

  const { container, dispatchedNotifications } = createMockContainer({
    ticket: sampleTicket,
    settings: customSettings,
  });

  await globalNotificationHandler({
    event: { name: "repair.status_changed", data: { id: "rep_merge_01", status: "awaiting_approval" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  const smsNotif = dispatchedNotifications.find((n) => n.channel === "sms");

  assert.ok(emailNotif);
  assert.strictEqual(emailNotif.content.subject, "Update on Google Pixel 8 (106): Awaiting Approval");
  assert.ok(emailNotif.content.html.includes("Hello Nelson, your Google Pixel 8 is now Awaiting Approval"));
  assert.ok(emailNotif.content.html.includes("PDF: http://localhost:3000/docs/invoice-106.pdf"));

  assert.ok(smsNotif);
  assert.ok(smsNotif.data.body.includes("Nelson: Google Pixel 8 #106 is Awaiting Approval"));
  assert.ok(smsNotif.data.body.includes("Total: $350.00"));
});

test("Requirement 1: repair.payment_received creates payment receipt notification with receipt document link", async () => {
  const sampleTicket = {
    id: "rep_pay_01",
    ticket_number: 107,
    status: "completed",
    payment_status: "captured",
    amount_paid: 200,
    total_estimate: 200,
    approval_token: "tok_receipt_01",
    customer_id: "cus_01",
    device: { model_name: "Lenovo ThinkPad" },
    metadata: {
      pdf_url: "http://localhost:3000/api/admin/documents/rec_999/document",
      short_pdf_link: "http://localhost:3000/r/rec999",
    },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.payment_received", data: { id: "rep_pay_01" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  assert.ok(emailNotif, "Payment receipt email must be queued");
  assert.ok(emailNotif.content.subject.includes("Payment Receipt"), "Subject must specify payment receipt");
  assert.ok(emailNotif.content.html.includes("PAID IN FULL"), "HTML must indicate paid in full");
  assert.strictEqual(emailNotif.data.pdf_url, "http://localhost:3000/api/admin/documents/rec_999/document");
});

test("Requirement 2: generateRepairPdfBuffer generates valid PDFs for all official document layouts", async () => {
  const sampleTicket = {
    id: "rep_pdf_test_01",
    ticket_number: "2026101501",
    status: "completed",
    payment_status: "paid",
    amount_paid: 15000,
    total_estimate: 15000,
    total_actual: 15000,
    labor_estimate: 3500,
    approval_token: "tok_test_pdf_01",
    accessories: "Power Cable & Sleeve",
    issue_description: "Cracked display glass and dead pixels on LCD panel.",
    technician_name: "Bonifencia A.",
    created_at: new Date().toISOString(),
    customer: {
      first_name: "Nelson",
      email: "nelson@example.com",
      phone: "+254700000000",
    },
    device: {
      brand: "Apple",
      model_name: "MacBook Air 13-inch (M2)",
      serial_number: "C02XYZ12345",
      imei: "N/A",
      condition: "Clean chassis with minor scratches on bottom plate",
      parts_used: [
        { name: "OEM Retina Display", sku: "APL-DISP-M2", price: 11500 },
      ],
    },
  };

  const settings = {
    company_name: "Urban Device Care Ltd",
    pdf_address: "Bekim House, Westlands, Nairobi",
    pdf_phone: "0729436660",
    pdf_email: "info@urbandevicecare.co.uk",
    kra_pin: "P052534849N",
  };

  const docTypes = ["invoice", "quote", "receipt", "job_card", "service_report", "handover"];

  for (const docType of docTypes) {
    const buffer = await generateRepairPdfBuffer(
      docType,
      sampleTicket,
      "Nelson Owalo",
      settings,
      "http://localhost:3000"
    );

    assert.ok(buffer instanceof Buffer, `Output for ${docType} must be a Buffer`);
    assert.ok(buffer.length > 500, `Buffer for ${docType} should be substantially sized (got ${buffer.length} bytes)`);
    // Verify standard PDF header magic bytes "%PDF-"
    const magicHeader = buffer.slice(0, 5).toString("ascii");
    assert.strictEqual(magicHeader, "%PDF-", `${docType} must start with standard PDF magic number %PDF-`);
  }
});

test("Requirement 1 & Handover: repair.created notification seamlessly embeds handed-over job_card link", async () => {
  const sampleTicket = {
    id: "rep_handover_job_01",
    ticket_number: 108,
    status: "received",
    approval_token: "tok_job_01",
    customer_id: "cus_01",
    device: { model_name: "iPhone 14 Pro" },
    metadata: {
      document_id: "doc_job_108",
      last_document_type: "job_card",
      pdf_url: "http://localhost:3000/documents/doc_job_108/document",
      short_pdf_link: "http://localhost:3000/r/job108",
    },
  };

  const { container, dispatchedNotifications } = createMockContainer({ ticket: sampleTicket });

  await globalNotificationHandler({
    event: { name: "repair.created", data: { id: "rep_handover_job_01" } },
    container,
  } as any);

  const emailNotif = dispatchedNotifications.find((n) => n.channel === "email");
  assert.ok(emailNotif, "Booking confirmation email must be sent on repair.created");
  assert.strictEqual(emailNotif.data.pdf_url, "http://localhost:3000/documents/doc_job_108/document");
  assert.strictEqual(emailNotif.data.short_pdf_url, "http://localhost:3000/r/job108");
});

test("Shortlink Resolution: repair shortlink routes resolve document-plugin links seamlessly without 404", async () => {
  const { GET: handleStoreRepairShortlink } = await import("../src/api/store/repairs/r/[code]/route.js");
  const { GET: handleApiStoreRepairShortlink } = await import("../src/api/api/store/repairs/r/[code]/route.js");

  let redirectedLocation = "";
  let statusCode = 0;
  const mockRes: any = {
    setHeader: (name: string, val: string) => {
      if (name === "Location") redirectedLocation = val;
    },
    status: (code: number) => {
      statusCode = code;
      return { send: () => {} };
    },
  };

  const mockReq: any = {
    params: { code: "doc_short_77" },
    get: () => "localhost:9000",
    protocol: "http",
    scope: {
      resolve: (key: string) => {
        if (key === "repair") {
          return {
            listRepairLinks: async () => [], // not found in repair links
          };
        }
        if (key === "documents") {
          return {
            listDocumentLinks: async (filter: any) => {
              if (filter.shortcode === "doc_short_77") {
                return [{ shortcode: "doc_short_77", url: "/documents/doc_invoice_77/document" }];
              }
              return [];
            },
          };
        }
        return null;
      },
    },
  };

  // Test 1: /store/repairs/r/:code
  await handleStoreRepairShortlink(mockReq, mockRes);
  assert.strictEqual(statusCode, 302);
  assert.strictEqual(redirectedLocation, "http://localhost:9000/documents/doc_invoice_77/document");

  // Test 2: /api/store/repairs/r/:code (used by storefront proxy)
  redirectedLocation = "";
  statusCode = 0;
  await handleApiStoreRepairShortlink(mockReq, mockRes);
  assert.strictEqual(statusCode, 302);
  assert.strictEqual(redirectedLocation, "http://localhost:9000/documents/doc_invoice_77/document");

  // Test 3: Root /r/:code route in repair plugin
  const { GET: handleRootRepairShortlink } = await import("../src/api/r/[code]/route.js");
  redirectedLocation = "";
  statusCode = 0;
  await handleRootRepairShortlink(mockReq, mockRes);
  assert.strictEqual(statusCode, 302);
  assert.strictEqual(redirectedLocation, "http://localhost:9000/documents/doc_invoice_77/document");

  // Test 4: Normalizing legacy admin URL in repair shortlink
  const legacyReq: any = {
    params: { code: "legacy_repair_short" },
    get: (h: string) => h === "host" ? "repair-backend.com" : h === "x-forwarded-proto" ? "https" : "",
    protocol: "http",
    scope: {
      resolve: (key: string) => {
        if (key === "repair") {
          return {
            listRepairLinks: async () => [{ shortcode: "legacy_repair_short", url: "http://localhost:3000/api/admin/documents/doc_rec_88/document" }],
          };
        }
        return null;
      },
    },
  };
  redirectedLocation = "";
  statusCode = 0;
  await handleRootRepairShortlink(legacyReq, mockRes);
  assert.strictEqual(statusCode, 302);
  assert.strictEqual(redirectedLocation, "https://repair-backend.com/documents/doc_rec_88/document");
});

test("Token Document Route: supports ticket lookup by ID and ticket number when token differs", async () => {
  const { GET: handleTokenDoc } = await import("../src/api/store/repairs/token/[token]/document/route.js");

  let sentData: any = null;
  const mockRes: any = {
    setHeader: () => {},
    send: (data: any) => { sentData = data; },
    status: () => ({ json: () => {}, send: () => {} }),
  };

  const mockTicket = {
    id: "rep_ticket_fallback_01",
    ticket_number: 999,
    status: "received",
    approval_token: "tok_secret_999",
    device: { model_name: "Google Pixel 8" },
    total_estimate: 200,
  };

  const mockReq: any = {
    params: { token: "rep_ticket_fallback_01" }, // Passing ID instead of approval_token
    query: { type: "job_card" },
    scope: {
      resolve: (key: string) => {
        if (key === "query") {
          return {
            graph: async (opts: any) => {
              if (opts.filters.approval_token === "rep_ticket_fallback_01") {
                return { data: [] }; // Not found by token
              }
              if (opts.filters.id === "rep_ticket_fallback_01") {
                return { data: [mockTicket] }; // Found by ID fallback
              }
              return { data: [] };
            },
          };
        }
        if (key === "repair") {
          return {
            listRepairSettings: async () => [{}],
            listRepairLinks: async () => [],
            createRepairLinks: async () => {},
          };
        }
        if (key === "logger") {
          return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
        }
        return null;
      },
    },
  };

  await handleTokenDoc(mockReq, mockRes);
  assert.ok(sentData, "Document must be generated and sent via ID fallback");
  assert.ok(sentData instanceof Buffer, "Document output must be a Buffer");
});


