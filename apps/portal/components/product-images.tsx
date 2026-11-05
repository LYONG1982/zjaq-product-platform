"use client";
import { useRef, useState } from "react";
export function ProductImages({ images }: { images: { id: string; src: string; alt: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(0);
  const previousOverflow = useRef("");
  const previousScroll = useRef({ x: 0, y: 0 });
  const restorePosition = () => { document.body.style.overflow = previousOverflow.current; window.scrollTo(previousScroll.current.x, previousScroll.current.y); };
  const close = () => { dialog.current?.close(); restorePosition(); };
  const open = (index: number) => { setSelected(index); previousScroll.current = { x: window.scrollX, y: window.scrollY }; previousOverflow.current = document.body.style.overflow; document.body.style.overflow = "hidden"; dialog.current?.showModal(); };
  return <><div className="product-image-stack">{images.map((item, index) => <figure key={item.id}><button onClick={() => open(index)} aria-label={`全屏查看图片 ${index + 1}`}><img src={item.src} alt={item.alt} loading="lazy" /></button>{item.alt && <figcaption>{item.alt}</figcaption>}</figure>)}</div>
    <dialog ref={dialog} className="product-image-dialog" aria-label="产品介绍图片全屏查看" onCancel={close} onClose={restorePosition} onKeyDown={event => { if (event.key === "ArrowLeft") setSelected(Math.max(0, selected - 1)); if (event.key === "ArrowRight") setSelected(Math.min(images.length - 1, selected + 1)); }}>
      <div className="image-viewer-controls"><button onClick={close}>关闭</button><button disabled={selected === 0} onClick={() => setSelected(selected - 1)}>上一张</button><span>{selected + 1} / {images.length}</span><button disabled={selected === images.length - 1} onClick={() => setSelected(selected + 1)}>下一张</button></div><img src={images[selected]?.src} alt={images[selected]?.alt} />
    </dialog></>;
}
