function isLocalHost() {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::" || host === "::1" || host === "[::1]";
}

export async function prepareServiceWorkerEnvironment() {
    if (!("serviceWorker" in navigator) || !isLocalHost()) {
        return false;
    }

    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
        const staleRegistrations = registrations.filter((registration) => {
            const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
            return scriptUrl && !scriptUrl.endsWith("/sw.js") && !scriptUrl.endsWith("/service-worker.js");
        });

        if (!staleRegistrations.length) {
            return false;
        }

        await Promise.all(staleRegistrations.map((registration) => registration.unregister()));
        if (!sessionStorage.getItem("street-hustle-sw-reset")) {
            sessionStorage.setItem("street-hustle-sw-reset", "1");
            window.location.reload();
            return true;
        }
    } catch (error) {
        console.warn("Service worker cleanup failed:", error);
    }

    return false;
}

export async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return false;
    }

    try {
        await navigator.serviceWorker.register("./sw.js", {
            scope: "./",
            updateViaCache: "none"
        });
        await navigator.serviceWorker.ready;
        return true;
    } catch (error) {
        console.warn("Service worker registration failed:", error);
        return false;
    }
}
