type ShipmentEmailInput = {
  clientName: string;
  clientEmail: string;
  trackingNumber: string;
  status: "Pending" | "In Transit" | "Delivered";
  origin: string;
  destination: string;
  eta?: string | null;
  trackingLink?: string | null;
};

type ShipmentOrderCreatedEmailInput = {
  clientName: string;
  clientEmail: string;
  trackingNumber: string;
  origin: string;
  destination: string;
  orderCreatedAt?: string | null;
  eta?: string | null;
  trackingLink?: string | null;
  itemDetails: string[];
};

export function buildShipmentStatusEmail(input: ShipmentEmailInput) {
  const subject = `WIS Shipment Update: ${input.trackingNumber} is ${input.status}`;

  const text = [
    `Hello ${input.clientName},`,
    "",
    "Your shipment status has been updated.",
    `Tracking Number: ${input.trackingNumber}`,
    `Status: ${input.status}`,
    `Route: ${input.origin} -> ${input.destination}`,
    input.eta ? `ETA: ${new Date(input.eta).toLocaleString()}` : null,
    "",
    input.trackingLink
      ? `Track your shipment here (no login required): ${input.trackingLink}`
      : "You can track your shipment anytime through the WIS Client Portal.",
    "",
    "Regards,",
    "Warehouse Information System"
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Shipment Status Update</h2>
      <p>Hello <strong>${input.clientName}</strong>,</p>
      <p>Your shipment status has been updated.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 6px 10px; font-weight: 600;">Tracking</td><td style="padding: 6px 10px;">${input.trackingNumber}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600;">Status</td><td style="padding: 6px 10px;">${input.status}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600;">Route</td><td style="padding: 6px 10px;">${input.origin} &rarr; ${input.destination}</td></tr>
        ${input.eta ? `<tr><td style="padding: 6px 10px; font-weight: 600;">ETA</td><td style="padding: 6px 10px;">${new Date(input.eta).toLocaleString()}</td></tr>` : ""}
      </table>
      ${input.trackingLink ? `<p>Track your shipment (no login required): <a href="${input.trackingLink}">${input.trackingLink}</a></p>` : "<p>You can track your shipment anytime through the WIS Client Portal.</p>"}
      <p style="margin-top: 16px;">Regards,<br/>Warehouse Information System</p>
    </div>
  `;

  return {
    to: input.clientEmail,
    subject,
    text,
    html
  };
}

export function buildShipmentOrderCreatedEmail(input: ShipmentOrderCreatedEmailInput) {
  const subject = `WIS Order Confirmed: ${input.trackingNumber}`;
  const portalUrl = "https://capstone-teal-psi.vercel.app/shipment-tracking";
  const itemsText = input.itemDetails.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const itemsHtmlRows = input.itemDetails
    .map(
      (item, index) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${index + 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${item}</td>
        </tr>
      `
    )
    .join("");
  const etaLabel = input.eta ? new Date(input.eta).toLocaleString() : "To be confirmed";
  const orderDateLabel = input.orderCreatedAt ? new Date(input.orderCreatedAt).toLocaleString() : new Date().toLocaleString();

  const text = [
    `Hello ${input.clientName},`,
    "",
    "Thank you for your order. We have successfully created your shipment in WIS.",
    "",
    "Order Summary",
    `Order Date: ${orderDateLabel}`,
    `Tracking Number: ${input.trackingNumber}`,
    `Route: ${input.origin} -> ${input.destination}`,
    `ETA: ${etaLabel}`,
    "",
    "Order Items:",
    itemsText,
    "",
    "How to track your order:",
    input.trackingLink ? `1) Open your direct tracking link: ${input.trackingLink}` : `1) Open: ${portalUrl}`,
    input.trackingLink ? "2) Or visit the portal and enter your tracking number" : "2) Enter your tracking number",
    `3) Tracking code: ${input.trackingNumber}`,
    "",
    "If you have questions, please reply to this email and our team will assist you.",
    "",
    "Regards,",
    "Warehouse Information System (WIS)",
    "Imarflex"
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="margin: 0; padding: 24px; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 680px; margin: 0 auto; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
        <tr>
          <td style="padding: 16px 20px; background: #0f172a; color: #f8fafc;">
            <div style="font-size: 18px; font-weight: 700;">Warehouse Information System</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">Imarflex • Order Confirmation</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px;">
            <h2 style="margin: 0 0 10px; font-size: 22px; color: #111827;">Order Confirmed</h2>
            <p style="margin: 0 0 12px;">Hello <strong>${input.clientName}</strong>,</p>
            <p style="margin: 0 0 16px; color: #334155;">
              Thank you for your order. We have successfully created your shipment in WIS.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 14px; background: #f8fafc; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 8px 10px; font-weight: 700; width: 150px; color: #334155;">Order Date</td>
                <td style="padding: 8px 10px; color: #111827;">${orderDateLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 10px; font-weight: 700; width: 150px; color: #334155;">Tracking Number</td>
                <td style="padding: 8px 10px; color: #111827;">${input.trackingNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 10px; font-weight: 700; color: #334155;">Route</td>
                <td style="padding: 8px 10px; color: #111827;">${input.origin} &rarr; ${input.destination}</td>
              </tr>
              <tr>
                <td style="padding: 8px 10px; font-weight: 700; color: #334155;">ETA</td>
                <td style="padding: 8px 10px; color: #111827;">${etaLabel}</td>
              </tr>
            </table>

            <p style="margin: 0 0 8px; font-weight: 700; color: #111827;">Order Items</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #e2e8f0;">
              <tr style="background: #f8fafc;">
                <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">#</th>
                <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">Description</th>
              </tr>
              ${itemsHtmlRows}
            </table>

            <div style="margin: 0 0 12px; padding: 10px 12px; border: 1px solid #e2e8f0; background: #f8fafc;">
              <p style="margin: 0 0 6px; font-weight: 700; color: #111827;">How to track your order</p>
              ${
                input.trackingLink
                  ? `<p style="margin: 0 0 4px; color: #334155;">1) Open direct link: <a href="${input.trackingLink}" style="color: #0f172a; font-weight: 700;">${input.trackingLink}</a></p>`
                  : `<p style="margin: 0 0 4px; color: #334155;">1) Open: <a href="${portalUrl}" style="color: #0f172a; font-weight: 700;">${portalUrl}</a></p>`
              }
              <p style="margin: 0 0 4px; color: #334155;">2) ${
                input.trackingLink ? "Or use the portal and enter your tracking number" : "Enter your tracking number"
              }</p>
              <p style="margin: 0; color: #334155;">3) Code: <strong>${input.trackingNumber}</strong></p>
            </div>

            <p style="margin: 0; color: #334155;">
              If you have questions, please reply to this email and our team will assist you.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 14px 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
            Regards,<br/>
            Warehouse Information System (WIS) • Imarflex
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    to: input.clientEmail,
    subject,
    text,
    html
  };
}
