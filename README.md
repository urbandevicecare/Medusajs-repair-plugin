# Medusa Repair Module

[![NPM Version](https://img.shields.io/npm/v/medusajs-repairshop-plugin.svg)](https://www.npmjs.com/package/medusajs-repairshop-plugin)
[![Medusa Plugin](https://img.shields.io/badge/Medusa-Plugin-violet.svg)](https://docs.medusajs.com)

A complete Repair Management System for Medusa, ideal for device repair shops. Features include customer tracking, parts management, granular omni-channel notifications, cost approval flows, and in-depth reporting.

## Features

### 🛠️ Backend / Admin Features
- **Ticket Management:** Track devices by standard serial numbers or IMEI. Manage repair life-cycles across statuses (`received`, `diagnosing`, `awaiting_approval`, `repairing`, `ready`, `completed`, `cancelled`, `refunded`).
- **Inventory Integration:** Add both standard Medusa product variants (reserves inventory) and custom ad-hoc parts. Completed tickets auto-deduct standard inventory.
- **Granular Settings Tab:** Toggle Email, SMS, and WhatsApp notifications directly from the plugin's Admin UI settings tab.
- **Embedded Templates:** Beautiful, responsive email templates are bundled directly inside the plugin—no global workspace configuration required.
- **Unified Timeline:** A single timeline view tracking internal notes, customer chat, and automated notifications.
- **Dynamic Invoicing & Zoho Books Sync:** Built-in PDF generation utilizing `pdfkit` OR seamless external synchronization with **Zoho Books**. Automatically pushes Contacts, Estimates, and Invoices to Zoho Books and streams official Zoho PDFs directly to your customers.
- **Payment Link Decoupling:** Secure integration with Medusa's `PaymentCollection` for standalone repair payments without forcing draft orders.

### 🏪 Frontend / Storefront Features
- **Storefront Dashboard:** A dedicated `/repairs/dashboard` page where logged-in customers can review historical and active repairs.
- **Self-Service Booking:** Customers can initiate repairs via `/repairs/book`.
- **Secure Approvals:** Token-based secure approval flow (`/store/repairs/track?token=...`) allowing users to review diagnostic costs or parts and click "Approve" or "Reject".
- **Real-Time Tracking & Compliance:** Surfaced estimate breakdowns, combined with native 'Data Wipe' and 'T&C' acceptance checkboxes.

## Installation & Integration

1. **Install the package:**
```bash
npm install medusajs-repairshop-plugin
# or
yarn add medusajs-repairshop-plugin
```

2. **Register the Plugin:**
Add it to your `medusa-config.ts` inside the `plugins` array:
```typescript
module.exports = defineConfig({
  plugins: [
    { resolve: "medusajs-repairshop-plugin" }
  ]
})
```

3. **Apply Database Migrations:**
```bash
npx medusa db:migrate
```

4. **Access the Interface:**
- Backend: Navigate to `/app/repairs` in your admin panel.

---

## 📘 Zoho Books Configuration Guide

This plugin seamlessly integrates with Zoho Books to generate Estimates, Tax Invoices, and log payments. To set it up, you need a **permanent Refresh Token**. 

Follow these steps exactly to avoid the `invalid_code` or `invalid_client` errors:

1. **Create a Zoho Self Client**
   - Go to the Zoho API Console ([api-console.zoho.com](https://api-console.zoho.com) or [api-console.zoho.eu](https://api-console.zoho.eu) if you are in Europe).
   - Click **Add Client** -> **Self Client**.
   - *Note: You must use a Self Client because it does not require a Redirect URI.*

2. **Generate a Temporary Grant Code**
   - In your newly created Self Client, go to the **Generate Code** tab.
   - Enter the scope: `ZohoBooks.fullaccess.all`
   - Select your portal/organization and click **Create**.
   - Copy the generated code. *Warning: This code expires in 3 minutes and can only be used once!*

3. **Exchange for a Permanent Refresh Token**
   - Immediately open your terminal and run the following `curl` command (Replace the `YOUR_` values with your actual Client ID, Client Secret, and the temporary Grant Code). 
   - *Important: If your account is in Europe, change `.com` to `.eu` in the URL below!*

   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
   -d "client_id=YOUR_CLIENT_ID" \
   -d "client_secret=YOUR_CLIENT_SECRET" \
   -d "code=YOUR_TEMPORARY_GRANT_CODE" \
   -d "grant_type=authorization_code"
   ```

4. **Save in Medusa Settings**
   - Zoho will return a JSON response containing a `refresh_token` (e.g., `1000.35cc05...`).
   - Go to your **Medusa Admin -> Repair Settings**.
   - Ensure you select the correct **Data Center (Domain)** that matches your account (`.com`, `.eu`, etc.).
   - Paste the `refresh_token` into the **Zoho Refresh Token** field and click Save. 
   - *Your plugin is now permanently authenticated!*
- Storefront: Link to `/repairs/dashboard` and `/repairs/book` in your frontend application (e.g. Next.js or Fresh.js).

### 📓 Zoho Books Integration
To completely offload Invoice and Estimate generation to Zoho Books:
1. Go to the [Zoho API Console](https://api-console.zoho.com/) and register a Server-based Application.
2. Obtain your **Client ID** and **Client Secret**.
3. Generate a **Refresh Token** with the `ZohoBooks.fullaccess.all` scope.
4. Locate your **Organization ID** in your Zoho Books dashboard url (e.g., `organization_id=12345678`).
5. Open your Medusa Admin, go to **Repairs -> Settings**, and toggle **Enable Zoho Books Sync**.
6. Paste your credentials. All future Quotes and Invoices will now be pushed automatically to Zoho Books and formatted using your official Zoho templates!

### 💳 Paystack Integration (Storefront Popup)
You can accept payments instantly from your customers using the Paystack inline popup directly on your storefront, bypassing the need for a complex checkout flow!

1. Open your Medusa Admin, go to **Repairs -> Settings**, and toggle **Enable Paystack Checkout**.
2. Paste your Paystack Public and Secret keys.
3. In your Storefront application (e.g. Next.js), use the Paystack inline script to trigger the popup when the customer clicks "Pay Now" on their repair dashboard:

```javascript
import PaystackPop from '@paystack/inline-js';

const payWithPaystack = () => {
  const paystack = new PaystackPop();
  paystack.newTransaction({
    key: 'YOUR_PUBLIC_KEY', // Can be fetched from your storefront backend
    email: customer.email,
    amount: ticket.total_actual, // amount in kobo
    reference: `REP-${ticket.ticket_number}-${Date.now()}`,
    metadata: {
      ticket_id: ticket.id // IMPORTANT: Pass the Medusa Ticket ID here
    },
    onSuccess: async (transaction) => {
      // 1. Send the reference to the plugin to verify and capture the payment
      await fetch(`http://localhost:9000/store/repairs/paystack/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: transaction.reference })
      });
      alert('Payment successful and receipt generated!');
    }
  });
};
```
*Note: Because you verify the payment directly from your storefront `onSuccess` callback via the `/store/repairs/paystack/verify` endpoint, you don't need to configure an overriding Paystack webhook! The plugin will automatically verify the payment securely from the backend and sync it to Zoho Books.*

### 🧪 Mock Test Endpoints
To verify the system's integrations (such as price formatting, Zoho Books tax handling, Notifications, and Paystack initializer) without having to manually trigger everything, you can use the built-in mock test suites:

- **Admin Testing Suite**: `GET /admin/repairs/test-suite`
  - *Validates Zoho VAT logic, exact decimal pricing (no `/ 100` bugs), and mock notification payloads.*
- **Storefront Testing Suite**: `GET /store/repairs/test-suite`
  - *Validates public tracking token logic and the strict secure server-side Paystack initializer payload handling.*

*Note: You must have created at least one repair ticket in the database for the test suites to run.*

---

## Changelog

### v0.1.98
- **PDF Layout Polish**: Added company contact details (address, phone, email, website) directly below the logo on PDF documents. Cleaned up the "Bill To" section by removing redundant Customer ID numbers, and suppressed internal Zoho sync error messages from customer-facing PDFs.
- **Short URL Redirection Fix**: Resolved a 500 error on `/r/[code]` shortlink redirects by properly querying and returning redirects.
- **Zoho Books Invoice Parity**: Removed explicit invoice/estimate number overrides that conflicted with Zoho's auto-generated numbering settings, seamlessly mapping repair ticket numbers to `reference_number` instead.
- **Document Payment Links**: Injected short payment links directly into invoice payment details and Zoho Books notes with partial payment support.
- **CI / CD Publishing**: Updated version bump workflow to ensure continuous integration and npm publishing run without skipping.

### v0.1.86
- **Storefront URL Shortlinks**: Updated the native URL shortener to construct short links using the `storefront_url` setting instead of the backend API URL, ensuring customers receive fully branded links (e.g., `https://urbandevicecare.co.uk/r/Xy29P`).

### v0.1.85
- **Native URL Shortener**: Built a custom URL shortener straight into the backend. Generates and stores 6-character shortcodes in a new `repair_link` table and redirects dynamically, completely eliminating the unreliable `tinyurl` external dependency for SMS/WhatsApp notifications.

### v0.1.84
- **SMS Payload & Duplicate Fix**: Resolved an issue where SMS notifications defaulted to sending template names instead of the actual message. Completely removed the legacy `repair-customer-reminder` subscriber, eliminating duplicate notifications.
- **Removed TinyURL**: Replaced all `tinyurl` API calls with full tracking/PDF URLs before the native shortener was introduced.
### v0.1.70 (Current)
- **Unified Minimalist Admin Dashboard**: Completely overhauled the Repair Ticket admin layout. Consolidated 'Issue Details', 'Update Details', 'Parts & Inventory', and 'Cost Breakdown' into a single, seamless, physical-ticket-style document. Restyled the Timeline & Communication feed into an open, borderless list for high legibility.
- **Unified Parts Input**: Merged the "Add Custom Part" and "Add Inventory Part" components into a single, multifunctional, compact input field with a dropdown mode toggle.
- **Paystack M-PESA Validation Fix**: Implemented an automated backend formatter in the `POST /admin/repairs/[id]/stk-push` route to strictly enforce Paystack's required `+254XXXXXXXXX` formatting, resolving `Invalid phone number format` failures during STK pushes.
- **Manual "Mark Paid" (Cash)**: Added a "Mark Paid (Cash)" button that bypasses STK push, setting ticket payment status to `captured`, transitioning status to `ready`, and flawlessly logging the cash payment against the remote Zoho Books invoice.

### v0.1.46
- **Medusa Workflow Strict Architecture**: Converted the Paystack verification and VAT toggle logic into native Medusa Workflows, adding resilient transaction compensations and rollbacks for external Zoho Books network calls.
- **Hybrid Document Generation Engine**: Intelligent document routing handles PDFs dynamically. Financial documents (Quotes, Invoices, Receipts) are pulled directly from the Zoho Books API on the fly to maintain perfect accounting parity, allowing you to edit invoices in Zoho before clients see them. Internal Job Cards securely bypass Zoho and generate locally via `pdfkit` for custom technician and customer signature layouts.
- **Global VAT Toggle**: Added a centralized "Add 16% VAT to Total" checkbox directly below the Cost Breakdown in the Admin UI. This replaces the old, per-item legacy checkboxes and calculates a seamless 16% markup on Parts + Labor.
- **Zoho Books Native Tax Sync**: Perfected the Zoho synchronization. When VAT is checked, the plugin sets `is_inclusive_tax: false` and lets Zoho accurately add its default organizational tax rate. When unchecked, it aggressively sends `tax_id: ""` to bypass Zoho's default taxes, ensuring your totals remain flat.
- **Medusa v2 BigNumber JSONB Fixes**: Introduced critical database migrations to add the implicit `raw_amount_paid` JSONB columns required by Medusa v2. This permanently stops silent backend rejection errors during partial updates.
- **Seamless UI Background Polling**: Rewrote the `loadTicket()` refresh mechanism to perform background polling without throwing the global `<Loading />` screen overlay. The UI now updates without visually unmounting.
- **GitHub Actions Release Assets**: Repaired the `ci.yml` pipeline to automatically build, pack, and attach the `.tgz` plugin bundle natively to the GitHub Releases page on every push.

### v1.12.0
- **Strict Server-Side Paystack Initializer**: `amount_paid` tracking is now natively enforced. The frontend is restricted to a secure server-initialized `access_code` generated by `POST /store/repairs/paystack/initialize`. This safeguards partial payment entries from being modified client-side.
- **Zoho Books Tax Precision**: Added explicit `tax_id: ""` overrides to `line_items` to stop Zoho from randomly injecting its default VAT rules on custom parts, avoiding backwards tax splitting.
- **Per-Item VAT Toggle**: Introduced a 'VAT?' toggle in the custom parts UI, letting you explicitly opt in/out of VAT.
- **Price Bug Fixes**: Removed legacy `/ 100` division operations universally in the plugin and Storefront, resolving `1012.65` layout bugs.
- **Enhanced UI**: Eliminated the 'View' button in the repair ticket list to free up table space; rows are now fully clickable and interactively styled.
- **Testing Suite**: Added `GET /admin/repairs/test-suite` and `GET /store/repairs/test-suite` mock endpoints.
- **Paystack Storefront Integration**: Introduced an inline storefront popup flow via `POST /store/repairs/paystack/verify`. This gracefully handles customer checkouts without interfering with the main Medusa Paystack plugin webhooks.
- **Zoho Books Native Syncing**: Fully synchronized Medusa parts to Zoho Books `Estimates` and `Invoices`. Payments captured locally are instantly logged into Zoho Books as payments. PDF Quotes and Receipts are securely pulled from Zoho on the fly.
- **Admin UI Polish**: Replaced default pills with modern underline tabs in the admin UI, converted standard variant dropdowns into auto-suggest lookup boxes, and ensured ticket lists default to sorting by newest (`created_at` DESC).
- **Omni-Channel Enhancements**: Notification templates now intelligently include PDF download links, the customer's name, the device name, and real-time total estimates where applicable.

### v1.10.0
- **Plugin Settings UI**: Added a dedicated `Settings` tab inside the Repairs admin page to granularly toggle Email, SMS, and WhatsApp notifications on the fly without server restarts.
- **Bundled Templates**: Completely decoupled email notification HTML templates from the global workspace and bundled them natively inside the plugin.
- **Payment Decoupling**: Replaced legacy Draft Order generation with Medusa's standard `PaymentCollection` API for frictionless, standalone repair checkouts.
- **Omni-Channel Granularity**: Modified the global subscriber (`notifications.ts`) and background workflows to dynamically check database settings before pushing payload events to providers.

### v1.9.0
- **Storefront Approvals**: Customers can natively approve or reject repair estimates directly from the tracking page.
- **Order Synchronization**: Added automated background subscribers to sync order statuses. An `order.canceled` event sets the ticket to `cancelled`, and a `refund.created` event correctly marks the ticket as `refunded`.
- **Workflow Automation**: Rejections now automatically trigger the `rejectRepairCostWorkflow` to release inventory and notify assigned technicians.

### v1.8.0
- **Bug Fix**: Fixed tracking backend returning 500 logic errors when invalid relational mappings were queried.
- **Bug Fix**: Secured the `/store/customers/me/repairs` dashboard endpoint using Medusa's standard `authenticate` middleware.
- **Stability Improvement**: Bolstered `GraphQuery` error handling to gracefully degrade instead of crashing the endpoint.

### v1.7.0
- **FreshJS Partials & View Transitions**: Overhauled the Storefront (`/repairs/*`) applications incorporating the `@fresh/runtime` `Partial` boundaries.
- **CSP Nonces Architecture**: Integrated baseline for Content Security Policy nonces targeting script behaviors in the frontend views.

### v1.6.0
- **Universal PDF Document Generation**: Added robust dynamic PDF rendering utilizing `pdfkit` and `qrcode` across both the Admin Dashboard and the Frontend Customer portals (Invoice, Quote, Receipt, Job Card).

### v1.5.0
- **Omni-Channel Notifications**: Designed a centralized subscriber module (`globalNotificationHandler`) that dispatches contextual Email, SMS, and WhatsApp alerts.
- **My Repairs Dashboard (Storefront)**: Added a `/repairs/dashboard` page where logged-in customers can review all repairs natively.

### v1.4.0
- **Self-Service Booking**: Customers can initiate and book repairs directly from the storefront (`/repairs/book`) when logged in.
- **Compliance Integration**: Standardized the Legal & Data Consent compliance directly into the book repair flow.

### v1.3.1
- **Currency Formatting**: Created `useStoreCurrency` custom React hook to fetch the configured `default_currency_code` dynamically instead of hardcoded USD/KES formats.

### v1.3.0
- **Unified Timeline & Nudges**: Merged notes and chats into a single timeline. The new "Send Reminder" button emits events to message customers across channels.

### v1.2.0
- **Parts Management & Inventory Sync**: Added removal UI for inventory parts. Stock is now automatically reserved when a part is added, and permanently deducted upon repair completion.

### v1.1.0
- **Usability Enhancements**: Added navigation submenu, accessories pill UI, tokenized customer approvals, and intelligent inventory deduction.

### v1.0.0
- Initial Release mapping core REST endpoints, data models, and baseline Admin SDK widgets.
