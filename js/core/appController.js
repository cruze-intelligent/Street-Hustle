import { GameEngine } from "./gameEngine.js";
import { PlayFabService } from "./playfabService.js";
import { RewardManager } from "./rewardManager.js";
import { UIStateManager } from "./uiStateManager.js";
import { getPwaInstallGuide, isIosInstallable, isStandaloneDisplay } from "./utils.js";

export class AppController {
    constructor(content) {
        this.content = content;
        this.rewardManager = new RewardManager(content);
        this.playFabService = new PlayFabService();
        this.engine = new GameEngine(content, this.rewardManager, this.playFabService);
        this.ui = new UIStateManager(document);
        this.deferredInstallPrompt = null;
        this.gameLoopId = null;
        this.autoSaveId = null;
        this.gameStarted = false;
        this.modalBusy = false;
        this.serviceWorkerRegistered = false;
    }

    async initialize() {
        await this.engine.initialize();
        this.bindUi();
        this.bindWindowEvents();
        this.ui.showLanding();
        this.render();
    }

    bindUi() {
        this.ui.bindHandlers({
            onStart: () => this.handleStartNewJourney(),
            onContinue: () => this.enterGame(),
            onInstall: () => this.handleInstall(),
            onNavigate: (stage) => {
                this.ui.setStage(stage);
                this.render();
            },
            onSave: async () => this.handleSave(),
            onManualHustle: (hustleId) => this.handleManualHustle(hustleId),
            onBuyHustle: (hustleId) => this.handleBuyHustle(hustleId),
            onOpenTrack: (hustleId) => this.handleTrackChoice(hustleId),
            onClaimReward: (rewardId) => this.handleClaimReward(rewardId),
            onSelectDistrict: (districtId) => this.handleSelectDistrict(districtId),
            onSync: async () => this.handleSync(),
            onReset: () => this.handleReset(),
            onReturnToLanding: () => this.returnToLanding()
        });
    }

    bindWindowEvents() {
        window.addEventListener("beforeinstallprompt", (event) => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            this.render();
        });

        window.addEventListener("appinstalled", () => {
            const reward = this.engine.maybeQueueInstallReward();
            if (reward) {
                this.ui.showToast("Install reward unlocked.", "success");
            }
            this.deferredInstallPrompt = null;
            this.render();
            this.engine.save({ cloud: false });
        });

        window.addEventListener("online", async () => {
            this.engine.connectCloudInBackground();
            await this.engine.syncCloud();
            this.render();
        });

        window.addEventListener("offline", () => {
            this.render();
        });

        document.addEventListener("visibilitychange", async () => {
            if (document.visibilityState === "hidden") {
                await this.engine.save();
            } else if (document.visibilityState === "visible" && this.gameStarted) {
                this.engine.tick(Date.now());
                this.render();
            }
        });

        window.addEventListener("beforeunload", () => {
            this.engine.saveLocal();
        });

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                this.serviceWorkerRegistered = true;
                this.render();
            });
        }
    }

    buildAppStatus() {
        const canInstall = Boolean(this.deferredInstallPrompt);
        const standalone = isStandaloneDisplay();
        const serviceWorkerSupported = "serviceWorker" in navigator;
        const offlineReady = serviceWorkerSupported && (this.serviceWorkerRegistered || Boolean(navigator.serviceWorker.controller));

        return {
            online: navigator.onLine,
            canInstall,
            standalone,
            showIosHint: isIosInstallable(),
            serviceWorkerSupported,
            offlineReady,
            installGuide: getPwaInstallGuide({
                canInstall,
                standalone,
                serviceWorkerSupported,
                offlineReady
            })
        };
    }

    setServiceWorkerStatus(registered) {
        this.serviceWorkerRegistered = Boolean(registered);
        this.render();
    }

    render() {
        const viewModel = this.engine.buildViewModel(this.buildAppStatus());
        this.ui.render(viewModel);
        this.ui.setStage(this.ui.currentStage);
    }

    startLoops() {
        if (!this.gameLoopId) {
            this.gameLoopId = window.setInterval(async () => {
                const result = this.engine.tick(Date.now());
                this.announceStateChanges(result);
                this.render();

                if (result.storyEvent && !this.modalBusy) {
                    await this.presentStoryEvent(result.storyEvent);
                }
            }, 250);
        }

        if (!this.autoSaveId) {
            this.autoSaveId = window.setInterval(() => {
                this.engine.save();
            }, 20000);
        }
    }

    stopLoops() {
        if (this.gameLoopId) {
            window.clearInterval(this.gameLoopId);
            this.gameLoopId = null;
        }

        if (this.autoSaveId) {
            window.clearInterval(this.autoSaveId);
            this.autoSaveId = null;
        }
    }

    async enterGame() {
        this.gameStarted = true;
        this.engine.markContinueAvailable();
        this.ui.showGame();
        this.ui.setStage(this.ui.currentStage || "home");
        const reward = isStandaloneDisplay() ? this.engine.maybeQueueInstallReward() : null;
        if (reward) {
            this.ui.showToast("Install reward added to your queue.", "success");
        }
        this.startLoops();
        this.render();
    }

    async returnToLanding() {
        await this.engine.save();
        this.stopLoops();
        this.gameStarted = false;
        this.ui.showLanding();
        this.render();
    }

    async handleStartNewJourney() {
        if (this.engine.continueAvailable) {
            const action = await this.ui.showModal({
                label: "New Journey",
                title: "Replace current progress?",
                body: "<p>Starting fresh will overwrite the current local run. Use Continue if you want to keep building from where you stopped.</p>",
                actions: [
                    { id: "cancel", label: "Cancel", variant: "secondary" },
                    { id: "confirm", label: "Start Fresh", variant: "primary" }
                ]
            });

            if (action !== "confirm") {
                return;
            }
        }

        this.engine.resetProgress();
        this.ui.setStage("home");
        await this.enterGame();
        this.ui.showToast("New journey started.", "success");
    }

    async handleInstall() {
        if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            await this.deferredInstallPrompt.userChoice;
            this.deferredInstallPrompt = null;
            this.render();
            return;
        }

        const installGuide = this.buildAppStatus().installGuide;
        await this.ui.showModal({
            label: "Install Guide",
            title: installGuide.headline,
            body: `
                <p><strong>${installGuide.browserLabel}</strong> on <strong>${installGuide.deviceLabel}</strong></p>
                <ol class="guide-list modal-guide-list">
                    ${installGuide.steps.map((step) => `<li>${step}</li>`).join("")}
                </ol>
                <p class="progress-copy">${installGuide.fallback}</p>
            `,
            actions: [
                { id: "done", label: "Done", variant: "primary" }
            ]
        });
    }

    async handleSave() {
        const result = await this.engine.save();
        this.ui.showToast(result.cloud ? "Saved locally and to cloud." : "Saved locally.", "success");
        this.render();
    }

    handleManualHustle(hustleId) {
        const result = this.engine.performManualHustle(hustleId);
        if (!result) {
            return;
        }
        this.announceStateChanges(result);
        this.render();
    }

    handleBuyHustle(hustleId) {
        const result = this.engine.purchaseHustle(hustleId);
        if (!result.success) {
            this.ui.showToast(result.message, "warning");
            return;
        }

        if (result.unlockedNew) {
            this.ui.showToast("New hustle unlocked.", "success");
        } else {
            this.ui.showToast("Upgrade purchased.", "success");
        }

        if (result.automatedNow) {
            this.ui.showToast("Automation unlocked for that hustle.", "success");
        }

        if (result.trackReady) {
            this.ui.showToast("Specialization track ready.", "warning");
        }

        this.announceStateChanges(result);
        this.render();
    }

    async handleTrackChoice(hustleId) {
        const hustle = this.content.hustlesById[hustleId];
        const action = await this.ui.showModal({
            label: "Specialize Hustle",
            title: `${hustle.name} Track`,
            body: hustle.tracks.map((track) => `
                <article class="stack-card">
                    <p class="panel-label">${track.name}</p>
                    <p class="stack-copy">${track.description}</p>
                </article>
            `).join(""),
            actions: [
                ...hustle.tracks.map((track) => ({ id: track.id, label: track.name, variant: "secondary" })),
                { id: "cancel", label: "Cancel", variant: "ghost" }
            ]
        });

        if (action === "cancel") {
            return;
        }

        const result = this.engine.chooseTrack(hustleId, action);
        if (!result.success) {
            this.ui.showToast(result.message, "warning");
            return;
        }

        this.ui.showToast(`${result.track.name} selected.`, "success");
        this.render();
    }

    handleClaimReward(rewardId) {
        const reward = this.rewardManager.claimReward(this.engine.state, rewardId);
        if (!reward) {
            return;
        }

        this.engine.unlockEligibleDistricts(Date.now());
        this.engine.state.economy.incomePerSecond = this.engine.calculateIncomePerSecond();
        this.rewardManager.evaluateAll(this.engine.state, Date.now());
        this.ui.showToast(`Claimed ${reward.title}.`, "success");
        this.render();
    }

    handleSelectDistrict(districtId) {
        if (!this.engine.setActiveDistrict(districtId)) {
            this.ui.showToast("That district is still locked.", "warning");
            return;
        }

        this.ui.setStage("home");
        this.ui.showToast("District changed.", "success");
        this.render();
    }

    async handleSync() {
        const synced = await this.engine.syncCloud();
        this.ui.showToast(synced ? "Cloud sync completed." : "Cloud sync unavailable right now.", synced ? "success" : "warning");
        this.render();
    }

    async handleReset() {
        const action = await this.ui.showModal({
            label: "Reset Progress",
            title: "Start over completely?",
            body: "<p>This clears the current local run and returns you to the beginning.</p>",
            actions: [
                { id: "cancel", label: "Cancel", variant: "secondary" },
                { id: "confirm", label: "Reset Everything", variant: "primary" }
            ]
        });

        if (action !== "confirm") {
            return;
        }

        this.engine.resetProgress();
        this.stopLoops();
        this.gameStarted = false;
        this.ui.showLanding();
        this.ui.showToast("Progress reset.", "success");
        this.render();
    }

    announceStateChanges(result) {
        (result.newlyQueued || []).forEach((reward) => {
            this.ui.showToast(`Reward ready: ${reward.title}`, "success");
        });

        (result.unlockedDistricts || []).forEach((district) => {
            this.ui.showToast(`${district.name} unlocked.`, "success");
        });
    }

    async presentStoryEvent(event) {
        this.modalBusy = true;
        const actions = event.choices.map((choice) => {
            const cashCost = Math.abs(Math.min(0, choice.rewards?.cash || 0));
            const disabled = cashCost > this.engine.state.economy.cash;
            return {
                id: choice.id,
                label: choice.label,
                variant: "secondary",
                disabled
            };
        });

        const action = await this.ui.showModal({
            label: "Street Event",
            title: event.title,
            body: `<p>${event.description}</p>`,
            actions
        });

        const result = this.engine.resolveStoryChoice(action, Date.now());
        if (result?.success) {
            this.ui.showToast(result.choice.outcome, "success");
        } else if (result?.message) {
            this.ui.showToast(result.message, "warning");
        }
        this.modalBusy = false;
        this.render();
    }
}
