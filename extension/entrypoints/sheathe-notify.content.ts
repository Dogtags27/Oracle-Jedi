import { isLocale, translator } from "@oj/core/i18n";
import { SHEATHE_PAGE } from "@/locales/sheathe-page";

export default defineContentScript({
  matches: ["https://web.whatsapp.com/*", "https://mail.google.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const shielded = () => document.documentElement?.getAttribute("data-oj-sheathe") === "on";
    const app = location.hostname === "web.whatsapp.com" ? "WhatsApp" : "Gmail";
    const tr = () => {
      const lang = document.documentElement?.getAttribute("data-oj-lang");
      return translator(SHEATHE_PAGE, isLocale(lang) ? lang : "en");
    };
    const scrub = (options: NotificationOptions = {}): NotificationOptions => ({
      ...options,
      body: tr()("notify.body"),
      icon: undefined,
      image: undefined,
      badge: undefined,
      data: undefined,
    } as NotificationOptions);
    const maskTitle = () => tr()("notify.title", { app });

    const Original = window.Notification;
    if (typeof Original === "function") {
      const Sheathed = function (this: unknown, title: string, options?: NotificationOptions) {
        return shielded() ? new Original(maskTitle(), scrub(options)) : new Original(title, options);
      } as unknown as typeof Notification;
      Object.defineProperty(Sheathed, "permission", { get: () => Original.permission });
      Object.defineProperty(Sheathed, "maxActions", { get: () => (Original as unknown as { maxActions?: number }).maxActions });
      (Sheathed as unknown as { requestPermission: typeof Notification.requestPermission }).requestPermission = Original.requestPermission.bind(Original);
      Sheathed.prototype = Original.prototype;
      Object.defineProperty(window, "Notification", { value: Sheathed, configurable: true, writable: true });
    }

    const proto = window.ServiceWorkerRegistration?.prototype;
    if (proto?.showNotification) {
      const show = proto.showNotification;
      proto.showNotification = function (title: string, options?: NotificationOptions) {
        return shielded() ? show.call(this, maskTitle(), scrub(options)) : show.call(this, title, options);
      };
    }
  },
});
