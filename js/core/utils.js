export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function formatMoney(amount) {
    const value = Math.floor(Number(amount) || 0);
    if (Math.abs(value) < 1000) {
        return value.toLocaleString("en-US");
    }
    if (Math.abs(value) < 1e6) {
        return `${(value / 1e3).toFixed(1)}K`;
    }
    if (Math.abs(value) < 1e9) {
        return `${(value / 1e6).toFixed(2)}M`;
    }
    return `${(value / 1e9).toFixed(2)}B`;
}

export function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

export function dateKey(input = Date.now()) {
    const date = new Date(input);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfDay(input = Date.now()) {
    const date = new Date(input);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function daysBetween(a, b) {
    const diff = startOfDay(b) - startOfDay(a);
    return Math.round(diff / 86400000);
}

export function makeId(prefix = "id") {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function sum(values) {
    return values.reduce((total, current) => total + current, 0);
}

export function isStandaloneDisplay() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function isIosInstallable() {
    const userAgent = window.navigator.userAgent || "";
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios/i.test(userAgent);
    return isIos && isSafari && !isStandaloneDisplay();
}

function getBrowserContext() {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
    const isiPadDesktop = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
    const isIos = /iphone|ipad|ipod/i.test(userAgent) || isiPadDesktop;
    const isAndroid = /android/i.test(userAgent);
    const isEdge = /edg/i.test(userAgent);
    const isFirefox = /firefox|fxios/i.test(userAgent);
    const isSamsung = /samsungbrowser/i.test(userAgent);
    const isOpera = /opr|opera/i.test(userAgent);
    const isChrome = /chrome|crios/i.test(userAgent) && !isEdge && !isFirefox && !isSamsung && !isOpera;
    const isSafari = /safari/i.test(userAgent) && !isChrome && !isEdge && !isFirefox && !isSamsung && !isOpera;
    const isDesktop = !isIos && !isAndroid;

    let browserLabel = "This browser";
    if (isEdge) {
        browserLabel = "Microsoft Edge";
    } else if (isSamsung) {
        browserLabel = "Samsung Internet";
    } else if (isChrome) {
        browserLabel = isIos ? "Chrome on iPhone/iPad" : "Google Chrome";
    } else if (isFirefox) {
        browserLabel = "Firefox";
    } else if (isSafari) {
        browserLabel = "Safari";
    }

    let deviceLabel = "Desktop";
    if (isIos) {
        deviceLabel = "iPhone / iPad";
    } else if (isAndroid) {
        deviceLabel = "Android";
    }

    return {
        isIos,
        isAndroid,
        isDesktop,
        isChrome,
        isEdge,
        isFirefox,
        isSafari,
        isSamsung,
        browserLabel,
        deviceLabel
    };
}

export function getPwaInstallGuide({
    canInstall = false,
    standalone = false,
    serviceWorkerSupported = false,
    offlineReady = false
} = {}) {
    const context = getBrowserContext();
    const offlineBadge = serviceWorkerSupported
        ? offlineReady ? "Offline cache active" : "Offline cache preparing"
        : "Browser-managed cache only";
    const sharedCapabilities = [
        offlineBadge,
        "Local-first save",
        "Cloud sync when online"
    ];

    if (standalone) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Installed",
            supportTone: "tag-emerald",
            headline: "Street Hustle is installed on this device",
            steps: [
                "Open the game from your home screen, app drawer, desktop, or dock for the cleanest full-screen flow.",
                "Play offline after the first successful online load; your progress continues saving on this device.",
                "Open the app while online after updates so new content and fixes refresh in the background."
            ],
            fallback: "If the installed shell looks outdated, open Street Hustle once in the browser while online to refresh cached files.",
            capabilities: [...sharedCapabilities, "Standalone app shell"]
        };
    }

    if (canInstall) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Install ready",
            supportTone: "tag-emerald",
            headline: "Install directly from this browser",
            steps: [
                "Tap Install App here, or use the browser's install option if it already appears in the menu or address bar.",
                "Confirm the prompt so Street Hustle gets its own icon and opens in a cleaner app-style shell.",
                "Launch the installed app once while online so offline files finish preparing for later sessions."
            ],
            fallback: "If the prompt disappears, reopen the page and try the browser menu option for Install app or Add to Home Screen.",
            capabilities: [...sharedCapabilities, "Standalone app shell"]
        };
    }

    if (context.isIos && context.isSafari) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Manual install",
            supportTone: "tag-warm",
            headline: "Use Safari Share to add Street Hustle to your home screen",
            steps: [
                "Open Street Hustle in Safari, then tap the Share button.",
                "Choose Add to Home Screen and confirm the title.",
                "Launch it from the new icon for full-screen play, local save, and offline access after the first online load."
            ],
            fallback: "If you opened the game in Chrome or another iPhone browser, switch to Safari for the best install flow.",
            capabilities: [...sharedCapabilities, "Home screen app icon"]
        };
    }

    if (context.isAndroid && (context.isChrome || context.isEdge || context.isSamsung)) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Menu install",
            supportTone: "tag-warm",
            headline: "Use the browser menu if the install prompt has not appeared yet",
            steps: [
                "Open the browser menu and look for Install app or Add to Home Screen.",
                "Confirm the install so Street Hustle stays one tap away from the launcher.",
                "Open it once after installation while online so the offline cache fully settles."
            ],
            fallback: "The button inside Street Hustle appears only when the browser exposes a native install prompt; the browser menu often works earlier.",
            capabilities: [...sharedCapabilities, "Home screen app icon"]
        };
    }

    if (context.isDesktop && (context.isChrome || context.isEdge)) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Desktop install",
            supportTone: "tag-warm",
            headline: "Install from the address bar or browser menu",
            steps: [
                "Look for the install icon in the address bar, or open the browser menu and choose Install Street Hustle.",
                "Confirm the install so the game appears in your apps list, desktop, or start menu.",
                "Open the installed app online after updates so refreshed files are cached for offline sessions."
            ],
            fallback: "If the browser does not offer install on this visit, keep playing in the tab for now and retry from Chrome or Edge after a full load.",
            capabilities: [...sharedCapabilities, "Standalone desktop window"]
        };
    }

    if (context.isDesktop && context.isSafari) {
        return {
            browserLabel: context.browserLabel,
            deviceLabel: context.deviceLabel,
            supportLabel: "Browser-dependent",
            supportTone: "tag-warm",
            headline: "Use Safari's web app option if it is available on this device",
            steps: [
                "Open Safari's menu and look for Add to Dock or another web app option.",
                "If Safari does not offer that option here, keep playing in the browser; local save still works on this device.",
                "For the most consistent install prompt on desktop, open Street Hustle in Chrome or Edge."
            ],
            fallback: "Install behavior on desktop Safari varies by OS and browser version, but local save and regular browser play still work.",
            capabilities: [...sharedCapabilities]
        };
    }

    return {
        browserLabel: context.browserLabel,
        deviceLabel: context.deviceLabel,
        supportLabel: "Browser play",
        supportTone: "tag-danger",
        headline: "Play here, or switch to a browser with web app install support",
        steps: [
            "Street Hustle still runs in this browser with local-first save on the current device.",
            "For a real app icon and standalone mode, use Safari on iPhone/iPad or Chrome, Edge, or Samsung Internet on Android and desktop.",
            "Use Save Progress before changing browsers so your latest local state is written cleanly on this device."
        ],
        fallback: "Install support is controlled by the browser vendor, so some browsers will stay in regular tab mode even though the game itself still works.",
        capabilities: [...sharedCapabilities]
    };
}

export function randomFrom(items) {
    if (!items.length) {
        return null;
    }
    return items[Math.floor(Math.random() * items.length)];
}
