// NOTE: The following code gives a structural/boilerplate setup for the advanced Warehouse Information System (WIS) using Next.js (App Router), Tailwind CSS, Supabase, Realtime features, RBAC middleware, inventory module with IoT simulation, logistics module with shipment updating and email, client portal, and foundational security auditing features. Individual file details and endpoints may need to be split according to your app/router structure.

// --- middleware.ts ---
// File: middleware.ts (place at root of Next.js project)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = req.nextUrl

  // Protect API routes and dashboard, exclude login/register/public
  if (!user && !['/login', '/register', '/'].some(path => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // RBAC: Example restriction
  if (pathname.startsWith('/dashboard')) {
    const session = await supabase.auth.getSession()
    const role = session.data.session?.user.user_metadata?.role
    // Only users with allowed roles can access dashboard
    if (!['admin', 'inventory', 'sales', 'client'].includes(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
    // If path is /dashboard/inventory, restrict to inventory or admin
    if (pathname.startsWith('/dashboard/inventory') && !['admin', 'inventory'].includes(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
    // /dashboard/logistics only for admin or sales
    if (pathname.startsWith('/dashboard/logistics') && !['admin', 'sales'].includes(role)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
    // /portal route only for clients
    if (pathname.startsWith('/portal') && role !== 'client') {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  }

  return res
}

// --- Dashboard Layout with Sidebar ---
// File: app/dashboard/layout.tsx
import React from "react";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="font-bold text-xl p-4 border-b border-gray-700">WIS Dashboard</div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard/inventory" className="block hover:bg-gray-700 rounded px-2 py-1">Inventory Module</Link>
          <Link href="/dashboard/logistics" className="block hover:bg-gray-700 rounded px-2 py-1">Logistics Module</Link>
          <Link href="/dashboard/security-audit" className="block hover:bg-gray-700 rounded px-2 py-1">Security Audit</Link>
          <Link href="/portal" className="block hover:bg-gray-700 rounded px-2 py-1">Client Portal</Link>
        </nav>
      </aside>
      <main className="flex-1 bg-gray-100 overflow-auto">{children}</main>
    </div>
  );
}

// --- Inventory Module Page with IoT Sensor Simulation & Supabase Realtime ---
// File: app/dashboard/inventory/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabase = createClientComponentClient();

const INVENTORY_TABLE = "inventory";

export default function InventoryModule() {
  const [items, setItems] = useState<any[]>([]);
  const [alert, setAlert] = useState<string | null>(null);

  async function fetchInventory() {
    const { data, error } = await supabase.from(INVENTORY_TABLE).select("*");
    if (data) setItems(data);
  }

  useEffect(() => {
    fetchInventory();

    // Subscribe to Realtime updates
    const channel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: INVENTORY_TABLE },
        (payload) => {
          fetchInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Simulate Sensor Data POST
  const simulateSensor = async (item_id: number, threshold_limit: number) => {
    // Random stock below threshold to trigger auto replenishment
    const new_stock = Math.floor(Math.random() * threshold_limit);
    await supabase
      .from(INVENTORY_TABLE)
      .update({ stock: new_stock })
      .eq("id", item_id);

    // Log replenishment
    if (new_stock < threshold_limit) {
      setAlert(`Item ID ${item_id} below threshold! Auto Replenishment triggered.`);
      await supabase.from("audit_logs").insert([
        {
          event: "auto_replenishment_triggered",
          details: `Stock below threshold for item ${item_id}`,
        },
      ]);
    } else {
      setAlert(null);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Inventory Module</h1>
      {alert && (
        <div className="bg-yellow-200 border border-yellow-600 text-yellow-900 p-2 rounded mb-4">
          {alert}
        </div>
      )}
      <table className="min-w-full border mb-4">
        <thead>
          <tr className="bg-gray-200">
            <th className="py-2 px-3 border">Item</th>
            <th className="py-2 px-3 border">Stock</th>
            <th className="py-2 px-3 border">Threshold</th>
            <th className="py-2 px-3 border">Sensor Simulation</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="border px-2 py-1">{item.name}</td>
              <td className="border px-2 py-1">{item.stock}</td>
              <td className="border px-2 py-1">{item.threshold_limit}</td>
              <td className="border px-2 py-1">
                <button
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                  onClick={() => simulateSensor(item.id, item.threshold_limit)}
                >
                  Simulate Sensor
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Logistics Module ---
// File: app/dashboard/logistics/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const supabase = createClientComponentClient();
const SHIPMENTS_TABLE = "shipments";

// Replace with actual email API if needed
async function triggerShipmentEmail(shipment: any, clientEmail: string) {
  // Would POST to API route to send email via Resend or Nodemailer
  await fetch("/api/notify-shipment", {
    method: "POST",
    body: JSON.stringify({ shipment, email: clientEmail }),
    headers: { "Content-Type": "application/json" },
  });
}

export default function LogisticsModule() {
  const [shipments, setShipments] = useState<any[]>([]);

  async function fetchShipments() {
    const { data, error } = await supabase.from(SHIPMENTS_TABLE).select("*");
    if (data) setShipments(data);
  }

  useEffect(() => {
    fetchShipments();
  }, []);

  const updateStatus = async (id: number, status: string, clientEmail: string, shipment: any) => {
    await supabase.from(SHIPMENTS_TABLE).update({ status }).eq("id", id);
    if (status === "In Transit") {
      await triggerShipmentEmail(shipment, clientEmail); // send email
    }
    fetchShipments();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Logistics Module</h1>
      <table className="min-w-full border mb-4">
        <thead>
          <tr className="bg-gray-200">
            <th className="py-2 px-3 border">Shipment ID</th>
            <th className="py-2 px-3 border">Client</th>
            <th className="py-2 px-3 border">Status</th>
            <th className="py-2 px-3 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id}>
              <td className="border px-2 py-1">{s.id}</td>
              <td className="border px-2 py-1">{s.client_email}</td>
              <td className="border px-2 py-1">{s.status}</td>
              <td className="border px-2 py-1">
                <select
                  value={s.status}
                  onChange={e =>
                    updateStatus(s.id, e.target.value, s.client_email, s)
                  }
                  className="border px-2 py-1 rounded"
                >
                  <option value="Pending">Pending</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- API Route for Email Notification via Resend/Nodemailer ---
// File: app/api/notify-shipment/route.ts
import { NextResponse } from "next/server";
// import nodemailer or use resend here as needed

export async function POST(req: Request) {
  const { shipment, email } = await req.json();

  // Compose an email template (for Nodemailer/Resend)
  const mailHtml = `
    <h2>Warehouse Shipment Update</h2>
    <p>Your shipment <b>#${shipment.id}</b> is now <b>${shipment.status}</b>.</p>
    <p>Thank you for using our WIS!</p>
  `;

  // Implement actual email sending here

  return NextResponse.json({ success: true });
}

// --- Client Portal (Clients only) ---
// File: app/portal/page.tsx
"use client";
import { useSession } from "@supabase/auth-helpers-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import React, { useEffect, useState } from "react";
const supabase = createClientComponentClient();

export default function ClientPortal() {
  const session = useSession();
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    async function fetchClientShipments() {
      const { data } = await supabase
        .from("shipments")
        .select("*")
        .eq("client_email", session?.user.email);

      if (data) setShipments(data);
    }
    if (session?.user?.email) {
      fetchClientShipments();
    }
  }, [session?.user?.email]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Track Your Shipment</h1>
      <table className="min-w-full border mb-4">
        <thead>
          <tr className="bg-gray-200">
            <th className="py-2 px-3 border">Shipment ID</th>
            <th className="py-2 px-3 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id}>
              <td className="border px-2 py-1">{s.id}</td>
              <td className="border px-2 py-1">{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Security Audit Log Page ---
// File: app/dashboard/security-audit/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
const supabase = createClientComponentClient();

export default function SecurityAudit() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    async function getLogs() {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setLogs(data);
    }
    getLogs();
  }, []);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Security Audit Log</h1>
      <table className="min-w-full border mb-4">
        <thead>
          <tr className="bg-gray-200">
            <th className="py-2 px-3 border">Timestamp</th>
            <th className="py-2 px-3 border">User</th>
            <th className="py-2 px-3 border">Event</th>
            <th className="py-2 px-3 border">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="border px-2 py-1">{l.created_at}</td>
              <td className="border px-2 py-1">{l.user_id || "System"}</td>
              <td className="border px-2 py-1">{l.event}</td>
              <td className="border px-2 py-1">{l.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- SUPABASE /DATABASE HINTS: ---
// RBAC: Enforce all SELECT/UPDATE/INSERT with Row Level Security on every table (see Supabase docs on RLS)
// MFA: Enable from Supabase Auth UI (enforce per role)
// AUDIT LOG: Create table 'audit_logs' with columns: id (uuid), user_id (uuid), event (text), details (text), created_at (timestamp) default now(), log on every relevant user action (via triggers or API)
