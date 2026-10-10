with open("src/services/zoho-books.ts", "r") as f:
    code = f.read()

# Update createEstimate
est_target = """    const payload = {
      customer_id: contactId,
      estimate_number: `RT-${ticket.ticket_number}`,
      reference_number: "",
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };"""

est_replacement = """    const payload = {
      customer_id: contactId,
      reference_number: `RT-${ticket.ticket_number}`,
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };"""

# Update createInvoice
inv_target = """    const payload = {
      customer_id: contactId,
      invoice_number: `INV-RT-${ticket.ticket_number}`,
      reference_number: "",
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };"""

inv_replacement = """    const payload = {
      customer_id: contactId,
      reference_number: `RT-${ticket.ticket_number}`,
      line_items: this.formatLineItems(ticket),
      notes,
      is_inclusive_tax: false
    };"""

code = code.replace(est_target, est_replacement)
code = code.replace(inv_target, inv_replacement)

with open("src/services/zoho-books.ts", "w") as f:
    f.write(code)
    print("SUCCESS ZOHO INVOICE FIX")
