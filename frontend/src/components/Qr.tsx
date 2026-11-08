import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useT } from "@oj/core/i18n/react";
import { VIEWER } from "../locales/viewer";

export function Qr({ value, size = 160, alt }: { value: string; size?: number; alt?: string }) {
  const t = useT(VIEWER);
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: "#1e1b17", light: "#fffdf8" } }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={alt ?? t("qr.alt")} className="rounded-lg" /> : null;
}
