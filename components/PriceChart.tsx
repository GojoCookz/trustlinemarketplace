"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeDrops: number;
};

type ChartStats = {
  priceXrp: number | null;
  priceChange24hPct: number | null;
  volume24hDrops: number;
  trades24h: number;
};

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const REFRESH_MS = 15_000;

// Candlestick chart fed exclusively by /api/charts — real on-ledger
// trades + sampled amm_info prices. Renders nothing it can't source.
export default function PriceChart({
  launchId,
  ticker,
}: {
  launchId: string;
  ticker: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setIntervalKey] = useState<(typeof INTERVALS)[number]>("5m");
  const [stats, setStats] = useState<ChartStats | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
      height: 280,
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#86efac",
      downColor: "#f87171",
      borderUpColor: "#86efac",
      borderDownColor: "#f87171",
      wickUpColor: "#86efac",
      wickDownColor: "#f87171",
      priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "rgba(134,239,172,0.3)",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/charts/${launchId}?interval=${interval}`);
        const json = await res.json();
        if (cancelled || !json.success) return;

        const candles: Candle[] = json.data.candles ?? [];
        setStats(json.data.stats ?? null);
        setEmpty(candles.length === 0);

        candleSeries.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
        volumeSeries.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volumeDrops / 1_000_000,
            color:
              c.close >= c.open
                ? "rgba(134,239,172,0.3)"
                : "rgba(248,113,113,0.3)",
          }))
        );
        chart.timeScale().fitContent();
      } catch {
        // transient fetch failure — next tick retries
      }
    }

    load();
    const timer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      chart.remove();
      chartRef.current = null;
    };
  }, [launchId, interval]);

  return (
    <div className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-foreground">
            {ticker} / XRP
          </p>
          {stats?.priceXrp != null && (
            <p className="text-xs font-mono text-foreground">
              {stats.priceXrp.toFixed(6)}
              {stats.priceChange24hPct != null && (
                <span
                  className={`ml-1.5 ${
                    stats.priceChange24hPct >= 0
                      ? "text-mint"
                      : "text-red-400"
                  }`}
                >
                  {stats.priceChange24hPct >= 0 ? "+" : ""}
                  {stats.priceChange24hPct.toFixed(2)}%
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setIntervalKey(iv)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                interval === iv
                  ? "bg-mint/10 text-mint"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className="w-full" />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted/60">
              no trades or price data recorded yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
