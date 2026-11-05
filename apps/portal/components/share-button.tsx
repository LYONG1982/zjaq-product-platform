"use client";
import { useRef, useState } from "react";
import { createClient, shareLink, shareQr } from "@zj/api-client";
export function ShareButton({ productId, materialId }: { productId: string; materialId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState(""), [qr, setQr] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function show() {
    dialog.current?.showModal(); setBusy(true); setLink(""); setQr(""); setMessage("");
    try {
      const client = createClient(location.origin + "/api");
      const [settings, product] = await Promise.all([client.shareSettings(), client.publicProduct(productId)]);
      const material = materialId ? product.data.materials.find(item => item.materialId === materialId) : undefined;
      if (materialId && !material) throw new Error("资料已撤回或当前身份不可访问");
      if (materialId) await client.manifest(productId, materialId);
      const target = shareLink(settings.data, productId, materialId, material?.shareRequiresSales === true);
      setQr(await shareQr(target, settings.data.size)); setLink(target);
    } catch(error) { setMessage(error instanceof Error ? error.message : "分享暂不可用"); } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(link); setMessage("链接已复制"); } catch { setMessage("复制失败，请手动复制链接"); } }
  return <><button className="outline-button" onClick={show}>分享{materialId ? "资料" : "产品"}</button><dialog ref={dialog} className="share-dialog" aria-label="分享二维码"><h2>分享二维码</h2>{busy && <p role="status">正在生成…</p>}{message && <p role="status">{message}</p>}{qr && <img src={qr} alt="产品资料黑白分享二维码" width="256" height="256" />}{link && <><input value={link} readOnly aria-label="分享链接" /><p>网页二维码；下架或撤回后停止访问。技术资料需销售身份。</p><button onClick={copy}>复制链接</button><a className="outline-button" href={qr} download="产品资料分享二维码.png">下载二维码</a></>}<button onClick={() => dialog.current?.close()}>关闭</button></dialog></>;
}
