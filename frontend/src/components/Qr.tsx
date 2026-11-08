import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: "#1e1b17", light: "#fffdf8" } }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="QR code" className="rounded-lg" /> : null;
}
