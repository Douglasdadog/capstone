"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  category?: string | null;
  image_url?: string | null;
};

type CartLine = { item_name: string; quantity: number };

const MAINTENANCE_FREE_IMAGES = [
  "/images/products/battery-maintenance-free-1.jpg",
  "/images/products/battery-maintenance-free-2.jpg",
  "/images/products/battery-maintenance-free-3.jpg",
  "/images/products/battery-maintenance-free-4.jpg"
];

const CONVENTIONAL_IMAGES = [
  "/images/products/battery-conventional-1.jpg",
  "/images/products/battery-conventional-2.jpg",
  "/images/products/battery-conventional-3.jpg",
  "/images/products/battery-conventional-4.jpg"
];

function dedupeInventoryByName(rows: InventoryItem[]): InventoryItem[] {
  const grouped = new Map<string, InventoryItem>();
  for (const row of rows) {
    const normalizedName = row.name.trim().toLowerCase();
    if (!normalizedName) continue;
    const current = grouped.get(normalizedName);
    if (!current) {
      grouped.set(normalizedName, { ...row, quantity: Math.max(0, Number(row.quantity) || 0) });
      continue;
    }
    grouped.set(normalizedName, {
      ...current,
      quantity: current.quantity + Math.max(0, Number(row.quantity) || 0),
      category: current.category ?? row.category ?? null,
      image_url: current.image_url ?? row.image_url ?? null
    });
  }
  return Array.from(grouped.values());
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [failedImageIds, setFailedImageIds] = useState<Record<string, true>>({});

  const itemByName = useMemo(() => new Map(items.map((item) => [item.name, item])), [items]);
  const getAvailableStock = (itemName: string) => itemByName.get(itemName)?.quantity ?? 0;
  const getCartQty = (itemName: string) => cart.find((line) => line.item_name === itemName)?.quantity ?? 0;
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((item) => item.category?.trim() || "General"))).sort()],
    [items]
  );
  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === "All" ? true : (item.category?.trim() || "General") === selectedCategory;
      const matchesKeyword = keyword.length === 0 ? true : item.name.toLowerCase().includes(keyword);
      return matchesCategory && matchesKeyword;
    });
  }, [items, searchQuery, selectedCategory]);

  const resolveProductImage = (item: InventoryItem, index: number) => {
    const candidate = item.image_url?.trim() ?? "";
    const hasUsableDbImage =
      candidate.length > 0 &&
      !failedImageIds[item.id] &&
      (candidate.startsWith("/") || candidate.startsWith("http://") || candidate.startsWith("https://"));
    if (hasUsableDbImage) return candidate;
    const normalizedCategory = (item.category ?? "").toLowerCase();
    const pool = normalizedCategory.includes("maintenance") ? MAINTENANCE_FREE_IMAGES : CONVENTIONAL_IMAGES;
    return pool[index % pool.length];
  };

  function markImageFailed(itemId: string) {
    setFailedImageIds((prev) => {
      if (prev[itemId]) return prev;
      return { ...prev, [itemId]: true };
    });
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/inventory");
        const data = (await response.json()) as { items?: InventoryItem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load products.");
        const uniqueItems = dedupeInventoryByName(data.items ?? []).filter((row) => Number(row.quantity) > 0);
        setItems(uniqueItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load products.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function addToCart(itemName: string) {
    const stock = getAvailableStock(itemName);
    if (stock <= 0) {
      setError(`"${itemName}" is currently out of stock.`);
      return;
    }
    setCart((prev) => {
      const found = prev.find((line) => line.item_name === itemName);
      if (!found) return [...prev, { item_name: itemName, quantity: 1 }];
      if (found.quantity >= stock) return prev;
      return prev.map((line) => (line.item_name === itemName ? { ...line, quantity: line.quantity + 1 } : line));
    });
    setError(null);
  }

  function updateQty(itemName: string, qty: number) {
    const stock = getAvailableStock(itemName);
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.item_name !== itemName) return line;
          if (!Number.isFinite(qty)) return line;
          const normalized = Math.floor(qty);
          if (normalized <= 0) return { ...line, quantity: 0 };
          const clamped = Math.min(Math.max(1, normalized), Math.max(1, stock));
          return { ...line, quantity: clamped };
        })
        .filter((line) => line.quantity > 0)
    );
  }

  function removeLine(itemName: string) {
    setCart((prev) => prev.filter((line) => line.item_name !== itemName));
  }

  const cartTotalItems = useMemo(() => cart.reduce((sum, row) => sum + row.quantity, 0), [cart]);
  const uniqueProductsInCart = cart.length;

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
      const tracking = payload.shipment?.tracking_token;
      const target = tracking ? `/client/orders?created=1&token=${encodeURIComponent(tracking)}` : "/client/orders?created=1";
      router.push(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <p className="mt-1 text-sm text-slate-600">
          Shop by available stock, review your cart, and submit your request in one flow.
        </p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Digital Catalog</h2>
              <p className="text-xs text-slate-500">
                {filteredItems.length} of {items.length} product(s)
              </p>
            </div>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search products..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500">Loading products...</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {filteredItems.map((item, index) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:shadow-sm">
                    <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <Image
                        src={resolveProductImage(item, index)}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                        onError={() => markImageFailed(item.id)}
                      />
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.category ?? "General"}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        In stock: {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(item.name)}
                        disabled={getCartQty(item.name) >= item.quantity}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {getCartQty(item.name) >= item.quantity ? "Max in Cart" : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                ))}
                {!loading && filteredItems.length === 0 ? (
                  <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No products match your current search/filter.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Shopping Cart</h2>
            <p className="mt-1 text-xs text-slate-500">
              {uniqueProductsInCart} product(s) • {cartTotalItems} total unit(s)
            </p>
            <div className="mt-3 space-y-2">
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500">Cart is empty.</p>
              ) : (
                cart.map((line) => (
                  <div key={line.item_name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">{line.item_name}</p>
                      <p className="text-[11px] text-slate-500">Stock: {getAvailableStock(line.item_name)}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(line.item_name, line.quantity - 1)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={getAvailableStock(line.item_name)}
                        value={line.quantity}
                        onChange={(event) => updateQty(line.item_name, Number.parseInt(event.target.value, 10))}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-center text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(line.item_name, line.quantity + 1)}
                        disabled={line.quantity >= getAvailableStock(line.item_name)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLine(line.item_name)}
                        className="ml-auto rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
