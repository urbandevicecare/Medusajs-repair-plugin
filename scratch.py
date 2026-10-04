with open("src/utils/generate-repair-document.ts", "r") as f:
    code = f.read()

target = """      // 2. Generate Estimate or Invoice or Receipt
      const metadata = ticket.metadata || {};"""

replacement = """      // 2. Generate Estimate or Invoice or Receipt
      const metadata = ticket.metadata || {};

      const targetTotal = (ticket.total_actual && ticket.total_actual > 0) ? ticket.total_actual : ticket.total_estimate;
      const balanceDue = Math.max(0, targetTotal - (ticket.amount_paid || 0));
      if (balanceDue > 0 && ticket.approval_token && (docType === "invoice" || docType === "quote")) {
          let sUrl = process.env.STORE_URL || "http://localhost:3000";
          if (settings?.storefront_url) sUrl = settings.storefront_url;
          sUrl = sUrl.replace(/\\/$/, "");
          const lUrl = `${sUrl}/repairs/track?token=${ticket.approval_token}`;
          const shortL = await getOrGenerateShortUrl(lUrl, repairService, sUrl);
          ticket._paymentLinkText = `Pay Online: ${shortL}`;
      }"""

if target in code:
    code = code.replace(target, replacement)
    with open("src/utils/generate-repair-document.ts", "w") as f:
        f.write(code)
    print("SUCCESS ZOHO URL INJECT")
else:
    print("FAILED ZOHO URL INJECT")
