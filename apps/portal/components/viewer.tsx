"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { safeReturnTo } from "./navigation-context";
import { createClient, ApiError } from "@zj/api-client";
import { PreviewSession, type Manifest } from "@zj/api-client/preview";
export function Viewer({
  productId,
  materialId,
  source,
}: {
  productId: string;
  materialId: string;
  source?: string;
}) {
  const returnTo = safeReturnTo(
    source,
    "/products/" + encodeURIComponent(productId),
  );
  const [manifest, setManifest] = useState<Manifest>(),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [changed, setChanged] = useState(false),
    [loading, setLoading] = useState(true),
    [generation, setGeneration] = useState(0);
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement>(null),
    session = useRef<PreviewSession>(undefined);
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : "预览失败，请重试");
    setChanged(e instanceof ApiError && (e.status === 409 || e.status === 404));
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setChanged(false);
    setManifest(undefined);
    setPage(1);
    const base = location.origin + "/api";
    void createClient(base)
      .manifest(productId, materialId)
      .then(({ data }) => {
        if (!active) return;
        session.current = new PreviewSession(base, data);
        setManifest(data);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
      session.current?.close();
      session.current = undefined;
    };
  }, [productId, materialId, generation]);
  useEffect(() => {
    if (!manifest || !session.current || !canvas.current || !image.current)
      return;
    let active = true;
    setLoading(true);
    setError("");
    void session.current
      .render(
        canvas.current,
        image.current,
        page,
        zoom,
        Math.max(240, (host.current?.clientWidth ?? 1000) - 48),
      )
      .then(() => {
        if (active) setLoading(false);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [manifest, page, zoom]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible")
        void session.current?.check().catch(fail);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  const turn = (n: number) => {
    const next = Math.max(1, Math.min(manifest?.pageCount ?? 1, n));
    if (next !== page) {
      setLoading(true);
      setPage(next);
    }
  };
  const resize = (n: number) => {
    setLoading(true);
    setZoom(n);
  };
  return (
    <div
      className="viewer-shell"
      ref={host}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowRight") turn(page + 1);
        if (e.key === "ArrowLeft") turn(page - 1);
      }}
      tabIndex={0}
      aria-label="资料查看器"
    >
      <div className="viewer-heading">
        <Link href={returnTo}>← 返回上一页</Link>
        {!returnTo.startsWith("/products/" + encodeURIComponent(productId)) && (
          <Link href={"/products/" + encodeURIComponent(productId)}>
            查看所属产品
          </Link>
        )}
        <div>
          <h1>{manifest?.name ?? "资料预览"}</h1>
          {manifest && (
            <span>
              {manifest.versionLabel} ·{" "}
              {manifest.previewKind === "pdf" ? "PDF" : "图片"}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void host.current
                ?.requestFullscreen()
                .catch(() => setError("当前浏览器不支持全屏"));
          }}
        >
          全屏 / 退出
        </button>
      </div>
      <div className="viewer-controls">
        <button
          disabled={loading || changed || page <= 1}
          onClick={() => turn(page - 1)}
        >
          上一页
        </button>
        <label>
          第{" "}
          <input
            type="number"
            min={1}
            max={manifest?.pageCount ?? 1}
            aria-label="页码"
            value={page}
            disabled={loading || changed}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0) turn(n);
            }}
          />{" "}
          / {manifest?.pageCount ?? "—"} 页
        </label>
        <button
          disabled={loading || changed || page >= (manifest?.pageCount ?? 1)}
          onClick={() => turn(page + 1)}
        >
          下一页
        </button>
        <button
          aria-label="缩小"
          disabled={loading || changed || zoom <= 0.5}
          onClick={() => resize(Math.max(0.5, zoom - 0.25))}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="放大"
          disabled={loading || changed || zoom >= 2.5}
          onClick={() => resize(Math.min(2.5, zoom + 0.25))}
        >
          ＋
        </button>
      </div>
      {error ? (
        <div className="viewer-message" role="alert">
          <h2>{error}</h2>
          <button onClick={() => setGeneration((g) => g + 1)}>
            {changed ? "打开当前版本" : "重试"}
          </button>
        </div>
      ) : (
        <div className="viewer-stage" aria-busy={loading}>
          {loading && <p role="status">正在载入第 {page} 页…</p>}
          <canvas ref={canvas} aria-label={"资料第 " + page + " 页"} hidden />
          <img ref={image} alt={"资料第 " + page + " 页"} hidden />
        </div>
      )}
    </div>
  );
}
