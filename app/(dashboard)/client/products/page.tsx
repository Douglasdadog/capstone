"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  category?: string | null;
};

type CartLine = { item_name: string; quantity: number };

export default function ClientProductsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [tin, setTin] = useState("");
  const [destination, setDestination] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/inventory");
        const data = (await response.json()) as { items?: InventoryItem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load products.");
        setItems((data.items ?? []).filter((row) => Number(row.quantity) > 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load products.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function addToCart(itemName: string) {
    setCart((prev) => {
      const found = prev.find((line) => line.item_name === itemName);
      if (!found) return [...prev, { item_name: itemName, quantity: 1 }];
      return prev.map((line) => (line.item_name === itemName ? { ...line, quantity: line.quantity + 1 } : line));
    });
  }

  function updateQty(itemName: string, qty: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.item_name === itemName ? { ...line, quantity: Math.max(1, Math.floor(qty || 1)) } : line))
        .filter((line) => line.quantity > 0)
    );
  }

  function removeLine(itemName: string) {
    setCart((prev) => prev.filter((line) => line.item_name !== itemName));
  }

  const cartTotalItems = useMemo(() => cart.reduce((sum, row) => sum + row.quantity, 0), [cart]);

  async function submitRequest() {
    if (!fullName.trim() || !destination.trim() || !contactNumber.trim()) {
      setError("Full name, delivery address, and contact number are required.");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one item to cart.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const response = await fetch("/api/portal/orders/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          business_name: businessName,
          tin,
          destination,
          contact_number: contactNumber,
          items: cart
        })
      });
      const payload = (await response.json()) as { error?: string; shipment?: { tracking_token?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit request.");
      router.push("/client/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="text-sm text-slate-600">Sign in to save order requests. Build your cart, then submit request.</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Digital Catalog</h2>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500">Loading products...</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {items.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.category ?? "General"} • Stock: {item.quantity}
                    </p>
                    <button
                      type="button"
                      onClick={() => addToCart(item.name)}
                      className="mt-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Shopping Cart</h2>
            <p className="mt-1 text-xs text-slate-500">{cartTotalItems} total item(s)</p>
            <div className="mt-3 space-y-2">
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500">Cart is empty.</p>
              ) : (
                cart.map((line) => (
                  <div key={line.item_name} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs font-semibold text-slate-700">{line.item_name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(event) => updateQty(line.item_name, Number.parseInt(event.target.value, 10))}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(line.item_name)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Submit Request</h2>
            <div className="mt-2 space-y-2">
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full Name / Business Name"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Business Name (optional)"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={tin}
                onChange={(event) => setTin(event.target.value)}
                placeholder="TIN (if business)"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={contactNumber}
                onChange={(event) => setContactNumber(event.target.value)}
                placeholder="Contact Number"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Precise Delivery Address"
                rows={3}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitRequest()}
                className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
