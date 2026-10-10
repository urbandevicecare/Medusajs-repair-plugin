import { Logger } from "@medusajs/framework/types";

interface ZohoConfig {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  organization_id: string;
  domain?: string;
}

export class ZohoBooksService {
  private config: ZohoConfig;
  private logger: Logger;
  private access_token: string | null = null;
  private token_expires_at: number = 0;

  constructor(config: ZohoConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  private get baseAccountsUrl() {
    return `https://accounts.zoho.${this.config.domain || "com"}`;
  }

  private get baseApiUrl() {
    return `https://www.zohoapis.${this.config.domain || "com"}/books/v3`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.access_token && Date.now() < this.token_expires_at) {
      return this.access_token;
    }

    this.logger.info(`[Zoho Books] Refreshing access token...`);
    const params = new URLSearchParams();
    params.append("refresh_token", this.config.refresh_token);
    params.append("client_id", this.config.client_id);
    params.append("client_secret", this.config.client_secret);
    params.append("grant_type", "refresh_token");

    const response = await fetch(this.baseAccountsUrl + "/oauth/v2/token", {
      method: "POST",
      body: params,
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      this.logger.error(`[Zoho Books] Failed to refresh token: ${JSON.stringify(data)}`);
      throw new Error("Zoho authentication failed");
    }

    this.access_token = data.access_token;
    this.token_expires_at = Date.now() + (data.expires_in - 300) * 1000;
    return this.access_token!;
  }

  private async request(method: string, endpoint: string, body?: any, isBlob: boolean = false) {
    const token = await this.getAccessToken();
    const url = `${this.baseApiUrl}${endpoint}${endpoint.includes("?") ? "&" : "?"}organization_id=${this.config.organization_id}`;
    
    const headers: Record<string, string> = {
      Authorization: `Zoho-oauthtoken ${token}`,
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (isBlob) {
      if (!res.ok) throw new Error(`Zoho API Error: ${res.statusText}`);
      return await res.arrayBuffer();
    }

    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      this.logger.error(`[Zoho Books] API Error: ${JSON.stringify(data)}`);
      throw new Error(`Zoho API Error: ${data.message || res.statusText}`);
    }
    return data;
  }

  async syncContact(customer: any): Promise<string> {
    const email = customer.email;
    const name = customer.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : email;
    
    // Check if contact exists by email
    if (email && email.includes("@")) {
      const searchRes = await this.request("GET", `/contacts?email=${encodeURIComponent(email)}`);
      if (searchRes.contacts && searchRes.contacts.length > 0) {
        return searchRes.contacts[0].contact_id;
      }
    }

    // Fallback: Check if contact exists by name
    if (name) {
      const searchNameRes = await this.request("GET", `/contacts?contact_name=${encodeURIComponent(name)}`);
      if (searchNameRes.contacts && searchNameRes.contacts.length > 0) {
        return searchNameRes.contacts[0].contact_id;
      }
    }

    // Create new contact
    const payload = {
      contact_name: name,
      company_name: name,
      contact_type: "customer",
      contact_persons: [{
        first_name: customer.first_name || "Customer",
        last_name: customer.last_name || "",
        email: email,
        phone: customer.phone || "",
      }]
    };
    
    const createRes = await this.request("POST", "/contacts", payload);
    return createRes.contact.contact_id;
  }

  private formatLineItems(ticket: any) {
    const items: any[] = [];
    const applyGlobalTax = ticket.apply_tax !== false;

    if (ticket.device?.parts_used && ticket.device.parts_used.length > 0) {
      for (const part of ticket.device.parts_used) {
        const exempt = !applyGlobalTax || part.is_taxable === false;
        items.push({
          name: part.name || "Part",
          description: part.sku ? `SKU: ${part.sku}` : "",
          rate: (Number(part.price || 0)).toFixed(2),
          quantity: 1,
          ...(exempt ? { tax_id: "" } : {})
        });
      }
    }
    
    // Also push labor if present
    if (ticket.labor_estimate > 0) {
      items.push({
        name: "Labor Charge",
        rate: (Number(ticket.labor_estimate || 0)).toFixed(2),
        quantity: 1,
        ...(!applyGlobalTax ? { tax_id: "" } : {})
      });
    }

    if (ticket.custom_parts && ticket.custom_parts.length > 0) {
      for (const cp of ticket.custom_parts) {
        const exempt = !applyGlobalTax || cp.is_taxable === false;
        items.push({
          name: cp.name || "Custom Part / Service",
          rate: (Number(cp.price || 0)).toFixed(2),
          quantity: 1,
          ...(exempt ? { tax_id: "" } : {})
        });
      }
    }

    if (items.length === 0) {
      items.push({
        name: `Repair Ticket #${ticket.ticket_number}`,
        rate: (Number(ticket.total_estimate || 0)).toFixed(2),
        quantity: 1,
        ...(!applyGlobalTax ? { tax_id: "" } : {})
      });
    }
    return items;
  }

  async createEstimate(contactId: string, ticket: any): Promise<string> {
    let notes = "Generated from Medusa Repair Module";
    if (ticket._paymentLinkText) notes += `\n\n${ticket._paymentLinkText}`;
    
    const payload = {
      customer_id: contactId,
      reference_number: `RT-${ticket.ticket_number}`,
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };

    const res = await this.request("POST", "/estimates", payload);
    return res.estimate.estimate_id;
  }

  async deleteEstimate(estimateId: string): Promise<void> {
    await this.request("DELETE", `/estimates/${estimateId}`);
  }

  async createInvoice(contactId: string, ticket: any): Promise<string> {
    let notes = "Generated from Medusa Repair Module";
    if (ticket._paymentLinkText) notes += `\n\n${ticket._paymentLinkText}`;

    const payload = {
      customer_id: contactId,
      reference_number: `RT-${ticket.ticket_number}`,
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };

    const res = await this.request("POST", "/invoices", payload);
    return res.invoice.invoice_id;
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    await this.request("DELETE", `/invoices/${invoiceId}`);
  }

  async getDocumentPdf(documentId: string, type: "estimate" | "invoice"): Promise<ArrayBuffer> {
    const endpoint = type === "estimate" ? `/estimates/${documentId}` : `/invoices/${documentId}`;
    return await this.request("GET", `${endpoint}?accept=pdf`, undefined, true);
  }

  async registerPayment(invoiceId: string, amount: number, contactId: string, paymentMode: string, referenceNumber?: string): Promise<string> {
    const payload: any = {
      customer_id: contactId,
      payment_mode: paymentMode || "Stripe",
      amount: (amount ).toFixed(2),
      date: new Date().toISOString().split('T')[0],
      invoices: [
        {
          invoice_id: invoiceId,
          amount_applied: (amount ).toFixed(2)
        }
      ]
    };
    if (referenceNumber) {
      payload.reference_number = referenceNumber;
    }
    const res = await this.request("POST", "/customerpayments", payload);
    return res.payment.payment_id;
  }

  async getPaymentReceiptPdf(paymentId: string): Promise<ArrayBuffer> {
    return await this.request("GET", `/customerpayments/${paymentId}?accept=pdf`, undefined, true);
  }
}
