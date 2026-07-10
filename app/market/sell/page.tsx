"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["digital", "physical", "services", "tokens"] as const;

export default function SellPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("digital");
  const [description, setDescription] = useState("");
  const [priceXrp, setPriceXrp] = useState("");
  const [deliveryDays, setDeliveryDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const userId = localStorage.getItem("tl_user_id");
    if (!userId) {
      router.push("/hub");
      return;
    }

    const price = parseFloat(priceXrp);
    if (!title.trim() || !description.trim() || isNaN(price) || price <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: userId,
          title: title.trim(),
          description: description.trim(),
          category,
          priceXrp: price,
          deliveryDays,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/market");
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  const fee = priceXrp ? (parseFloat(priceXrp) * 0.03).toFixed(2) : "0.00";
  const payout = priceXrp
    ? (parseFloat(priceXrp) * 0.97).toFixed(2)
    : "0.00";

  return (
    <div className="flex flex-col gap-6 py-8">
      <button
        onClick={() => (step > 1 ? setStep(step - 1) : router.push("/market"))}
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; {step > 1 ? "back" : "cancel"}
      </button>

      <header>
        <h1 className="text-xl font-bold text-mint">[sell something]</h1>
        <p className="text-xs text-muted">step {step} of 3</p>
      </header>

      <div className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-full ${
              s <= step ? "bg-mint" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">
              what are you selling?
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="give it a name"
              maxLength={80}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border p-3 text-sm transition-colors ${
                    category === cat
                      ? "bg-mint/10 border-mint/30 text-mint"
                      : "bg-card border-white/5 text-foreground hover:border-mint/20"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => title.trim() && setStep(2)}
            disabled={!title.trim()}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            [next]
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">
              description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="describe what you're selling"
              rows={4}
              maxLength={2000}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30 resize-none"
            />
            <p className="text-[10px] text-muted text-right mt-1">
              {description.length}/2000
            </p>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">price (xrp)</label>
            <input
              type="number"
              value={priceXrp}
              onChange={(e) => setPriceXrp(e.target.value)}
              placeholder="0"
              min="0.000001"
              step="any"
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <p className="text-[10px] text-muted mt-1">
              all prices in xrp for phase 1
            </p>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">
              delivery window
            </label>
            <div className="flex gap-2">
              {[1, 3, 7, 14].map((d) => (
                <button
                  key={d}
                  onClick={() => setDeliveryDays(d)}
                  className={`flex-1 rounded-lg border p-2 text-xs transition-colors ${
                    deliveryDays === d
                      ? "bg-mint/10 border-mint/30 text-mint"
                      : "bg-card border-white/5 text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() =>
              description.trim() &&
              priceXrp &&
              parseFloat(priceXrp) > 0 &&
              setStep(3)
            }
            disabled={!description.trim() || !priceXrp || parseFloat(priceXrp) <= 0}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            [next]
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-foreground">
              review your listing
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-muted">title</span>
              <span className="text-foreground">{title}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">category</span>
              <span className="text-foreground">{category}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">price</span>
              <span className="text-mint font-bold">
                {parseFloat(priceXrp).toFixed(2)} xrp
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">platform fee (3%)</span>
              <span className="text-foreground">{fee} xrp</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">you receive</span>
              <span className="text-mint font-bold">{payout} xrp</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">delivery window</span>
              <span className="text-foreground">{deliveryDays} days</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">payment protection</span>
              <span className="text-mint">escrow enabled</span>
            </div>
          </div>

          <div className="rounded-lg bg-mint/5 border border-mint/10 p-3 text-center text-xs text-mint">
            buyers pay into escrow. you get paid when they confirm delivery.
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            {submitting ? "listing..." : "[list it]"}
          </button>
        </div>
      )}
    </div>
  );
}
