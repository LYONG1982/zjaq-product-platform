"use client";
import { useEffect, useState } from "react";
export function ProductVisual({
  src,
  alt,
  large = false,
}: {
  src?: string | null;
  alt: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={
        "product-visual" + (large ? " large" : "") + (failed ? " failed" : "")
      }
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="visual-symbol" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {large && failed && (
        <span className="visual-error">
          图片暂不可用{" "}
          <button onClick={() => setFailed(false)}>重试图片</button>
        </span>
      )}
    </div>
  );
}
