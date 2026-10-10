with open("src/utils/generate-repair-document.ts", "r") as f:
    code = f.read()

# 1. Remove customer id
cust_target = """  // Bill To / Customer Data
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(customerName || "Customer", 50, metaY);
  doc.font("Helvetica").fontSize(9).fillColor("#333");
  if (ticket.customer_id) {
      doc.text(`Customer ID: ${ticket.customer_id}`);
  }
  
  currentY = Math.max(rowY, metaY + 40) + 20;"""

cust_replace = """  // Bill To / Customer Data
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(customerName || "Customer", 50, metaY);
  doc.font("Helvetica").fontSize(9).fillColor("#333");
  
  currentY = Math.max(rowY, metaY + 40) + 20;"""

code = code.replace(cust_target, cust_replace)

# 2. Add address under logo
logo_target = """  } catch (e) {
      doc.fontSize(24).font("Helvetica-Bold").fillColor("#333").text(settings?.company_name || "URBAN DEVICE CARE", 50, 50);
  }

  // 2. Document Title & Number
  let title = "INVOICE";"""

logo_replace = """  } catch (e) {
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
  let title = "INVOICE";"""

code = code.replace(logo_target, logo_replace)

# 3. Remove Zoho error from PDF
error_target = """  } else {
      doc.text("Thanks for your business.", 50, footerY);
  }

  if (zohoError) { doc.fontSize(8).fillColor("red").text(zohoError, 50, footerY + 15, { lineBreak: false }); }

  if (qrBuffer) {"""

error_replace = """  } else {
      doc.text("Thanks for your business.", 50, footerY);
  }

  if (qrBuffer) {"""

code = code.replace(error_target, error_replace)

with open("src/utils/generate-repair-document.ts", "w") as f:
    f.write(code)
    print("SUCCESS CHANGES")
