import { test } from "node:test";
import assert from "node:assert";
import { generateRepairDocument } from "../src/utils/generate-repair-document";
import { GET as getTechnicians, POST as addTechnician, DELETE as removeTechnician } from "../src/api/admin/repairs/technicians/route";

test("Safeguard: generateRepairDocument returns user-friendly HTML error page when accept header is text/html", async () => {
  let status = 0;
  let sentHtml = "";
  let headers: Record<string, string> = {};

  const fakeRes: any = {
    status: (s: number) => {
      status = s;
      return fakeRes;
    },
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    send: (content: string) => {
      sentHtml = content;
    },
    json: () => {},
  };

  const fakeReq: any = {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    scope: {
      resolve: (key: string) => {
        if (key === "logger") return { info: () => {}, warn: () => {}, error: () => {} };
        return null; // Documents module is missing
      },
    },
  };

  const sampleTicket = {
    id: "rep_ticket_safeguard",
    ticket_number: "RT-1001",
    status: "received",
    total_estimate: 100,
    amount_paid: 0,
  };

  await generateRepairDocument("invoice", sampleTicket, "Customer", fakeRes, fakeReq);

  assert.strictEqual(status, 503, "Must return 503 Service Unavailable for HTML error page");
  assert.ok(headers["Content-Type"].includes("text/html"), "Must serve text/html content");
  assert.ok(sentHtml.includes("Documents Plugin Required"), "Must include friendly safeguard title");
  assert.ok(sentHtml.includes("medusajs-documents-plugin"), "Must inform the user about medusajs-documents-plugin");
});

test("Safeguard: generateRepairDocument returns JSON error when accept header is application/json", async () => {
  let status = 0;
  let jsonBody: any = null;

  const fakeRes: any = {
    status: (s: number) => {
      status = s;
      return fakeRes;
    },
    json: (j: any) => {
      jsonBody = j;
    },
  };

  const fakeReq: any = {
    headers: {
      accept: "application/json",
    },
    scope: {
      resolve: (key: string) => {
        if (key === "logger") return { info: () => {}, warn: () => {}, error: () => {} };
        return null;
      },
    },
  };

  const sampleTicket = {
    id: "rep_ticket_safeguard",
    ticket_number: "RT-1001",
    status: "received",
    total_estimate: 100,
    amount_paid: 0,
  };

  await generateRepairDocument("invoice", sampleTicket, "Customer", fakeRes, fakeReq);

  assert.strictEqual(status, 500, "Must return 500 when documents module is missing");
  assert.strictEqual(jsonBody?.error, "documents_module_not_found", "Must return documents_module_not_found error code");
  assert.strictEqual(jsonBody?.documents_plugin_installed, false, "Must flag documents_plugin_installed as false");
});

test("Technicians API: GET, POST and DELETE work as expected", async () => {
  const mockCustomers: any[] = [
    {
      id: "cus_nelson",
      first_name: "Nelson",
      last_name: "Owalo",
      email: "nelson@example.com",
      phone: "+44123456",
      metadata: { is_technician: true, role: "technician" },
    },
    {
      id: "cus_regular",
      first_name: "Regular",
      last_name: "Customer",
      email: "regular@example.com",
      phone: "+44999999",
      metadata: {},
    },
  ];

  // 1. GET
  let getResult: any = null;
  const mockGetRes: any = {
    json: (data: any) => { getResult = data; },
    status: () => mockGetRes,
  };
  const mockGetReq: any = {
    scope: {
      resolve: () => ({
        graph: async () => ({ data: mockCustomers }),
      }),
    },
  };
  await getTechnicians(mockGetReq, mockGetRes);
  assert.strictEqual(getResult.technicians.length, 1);
  assert.strictEqual(getResult.technicians[0].id, "cus_nelson");

  // 2. POST (promote existing customer)
  let postResult: any = null;
  const mockPostRes: any = {
    json: (data: any) => { postResult = data; },
    status: () => mockPostRes,
  };
  const mockPostReq: any = {
    body: { customer_id: "cus_regular" },
    scope: {
      resolve: () => ({
        retrieveCustomer: async (id: string) => mockCustomers.find(c => c.id === id),
        updateCustomers: async (id: string, update: any) => {
          const cust = mockCustomers.find(c => c.id === id);
          Object.assign(cust, update);
          return cust;
        },
      }),
    },
  };
  await addTechnician(mockPostReq, mockPostRes);
  assert.ok(postResult.technician, "Must return created/updated technician");
  assert.strictEqual(postResult.technician.id, "cus_regular");

  // 3. DELETE (demote technician)
  let deleteResult: any = null;
  const mockDeleteRes: any = {
    json: (data: any) => { deleteResult = data; },
    status: () => mockDeleteRes,
  };
  const mockDeleteReq: any = {
    query: { id: "cus_regular" },
    body: {},
    scope: {
      resolve: () => ({
        retrieveCustomer: async (id: string) => mockCustomers.find(c => c.id === id),
        updateCustomers: async (id: string, update: any) => {
          const cust = mockCustomers.find(c => c.id === id);
          Object.assign(cust, update);
          return cust;
        },
      }),
    },
  };
  await removeTechnician(mockDeleteReq, mockDeleteRes);
  assert.strictEqual(deleteResult.success, true);
  assert.strictEqual(mockCustomers[1].metadata.is_technician, undefined);
});
