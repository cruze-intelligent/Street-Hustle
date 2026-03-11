import { AppController } from "./core/appController.js";
import { loadContent } from "./core/contentLoader.js";
import { prepareServiceWorkerEnvironment, registerServiceWorker } from "./core/serviceWorkerManager.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const reloadingForServiceWorkerCleanup = await prepareServiceWorkerEnvironment();
        if (reloadingForServiceWorkerCleanup) {
            return;
        }

        const content = await loadContent();
        const app = new AppController(content);
        await app.initialize();
        const serviceWorkerRegistered = await registerServiceWorker();
        app.setServiceWorkerStatus(serviceWorkerRegistered);
    } catch (error) {
        console.error("Street Hustle failed to initialize:", error);
        document.body.innerHTML = `
            <main style="min-height:100vh;display:grid;place-items:center;padding:24px;color:#fff5e8;background:#140d08;font-family:'Avenir Next','Trebuchet MS',sans-serif;">
                <section style="max-width:540px;background:rgba(32,20,13,0.92);padding:24px;border-radius:24px;border:1px solid rgba(255,209,163,0.16);">
                    <p style="text-transform:uppercase;letter-spacing:.18em;font-size:.72rem;color:#c1a286;margin:0 0 12px;">Street Hustle</p>
                    <h1 style="margin:0 0 12px;font-family:Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;">Initialization Error</h1>
                    <p style="margin:0 0 14px;line-height:1.6;color:#f4d9c0;">The relaunch content did not load correctly. Refresh the page or check that the JSON content files are available.</p>
                    <pre style="white-space:pre-wrap;color:#ffd8a8;">${error.message}</pre>
                </section>
            </main>
        `;
    }
});
