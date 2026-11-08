export default defineContentScript({
  matches: ["https://web.whatsapp.com/*", "https://mail.google.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const shielded = () => document.documentElement?.getAttribute("data-oj-sheathe") === "on";
    const app = location.hostname === "web.whatsapp.com" ? "WhatsApp" : "Gmail";
    const scrub = (options: NotificationOptions = {}): NotificationOptions => ({
      ...options,
      body: "Hidden while you're sharing your screen",
      icon: undefined,
      image: undefined,
      badge: undefined,
      data: undefined,
    } as NotificationOptions);

    const Original = window.Notification;
    if (typeof Original === "function") {
      const Sheathed = function (this: unknown, title: string, options?: NotificationOptions) {
        return shielded() ? new Original(`New ${app} message`, scrub(options)) : new Original(title, options);
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
        return shielded() ? show.call(this, `New ${app} message`, scrub(options)) : show.call(this, title, options);
      };
    }
  },
});
