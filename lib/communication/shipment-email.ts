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
  const itemsText = input.itemDetails.map((item) => `- ${item}`).join("\n");
  const itemsHtml = input.itemDetails.map((item) => `<li>${item}</li>`).join("");

  const text = [
    `Hello ${input.clientName},`,
    "",
    "Your order has been created in WIS.",
    `Tracking Number: ${input.trackingNumber}`,
    `Route: ${input.origin} -> ${input.destination}`,
    input.eta ? `ETA: ${new Date(input.eta).toLocaleString()}` : "ETA: To be confirmed",
    "",
    "Order Items:",
    itemsText,
    "",
    input.trackingLink
      ? `Track your shipment here (no login required): ${input.trackingLink}`
      : "Tracking link will be shared once available.",
    "",
    "Regards,",
    "Warehouse Information System"
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Order Confirmation</h2>
      <p>Hello <strong>${input.clientName}</strong>,</p>
      <p>Your order has been created in WIS.</p>
      <table style="border-collapse: collapse; margin: 12px 0;">
        <tr><td style="padding: 6px 10px; font-weight: 600;">Tracking</td><td style="padding: 6px 10px;">${input.trackingNumber}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600;">Route</td><td style="padding: 6px 10px;">${input.origin} &rarr; ${input.destination}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600;">ETA</td><td style="padding: 6px 10px;">${input.eta ? new Date(input.eta).toLocaleString() : "To be confirmed"}</td></tr>
      </table>
      <p style="margin-bottom: 4px;"><strong>Order Items</strong></p>
      <ul style="margin-top: 0; padding-left: 18px;">${itemsHtml}</ul>
      ${input.trackingLink ? `<p>Track your shipment (no login required): <a href="${input.trackingLink}">${input.trackingLink}</a></p>` : "<p>Tracking link will be shared once available.</p>"}
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
