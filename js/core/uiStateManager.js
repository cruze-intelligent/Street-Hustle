import { formatMoney } from "./utils.js";

function buttonClass(variant = "secondary") {
    if (variant === "primary") return "button button-primary";
    if (variant === "ghost") return "button button-ghost";
    return "button button-secondary";
}

export class UIStateManager {
    constructor(documentRef = document) {
        this.document = documentRef;
        this.currentStage = "home";
        this.handlers = {};
        this.modalResolver = null;
        this.resourceFlashTimers = new Map();
        this.previousResourceValues = {};
        this.refs = {
            landingScreen: this.document.getElementById("landing-screen"),
            gameShell: this.document.getElementById("game-shell"),
            continueButton: this.document.getElementById("continue-button"),
            installButton: this.document.getElementById("install-button"),
            installHint: this.document.getElementById("install-hint"),
            cashDisplay: this.document.getElementById("cash-display"),
            credDisplay: this.document.getElementById("cred-display"),
            incomeDisplay: this.document.getElementById("income-display"),
            earnedDisplay: this.document.getElementById("earned-display"),
            networkPill: this.document.getElementById("network-pill"),
            syncPill: this.document.getElementById("sync-pill"),
            activeMissionTitle: this.document.getElementById("active-mission-title"),
            activeMissionCopy: this.document.getElementById("active-mission-copy"),
            activeMissionTag: this.document.getElementById("active-mission-tag"),
            activeMissionProgress: this.document.getElementById("active-mission-progress"),
            activeMissionMeta: this.document.getElementById("active-mission-meta"),
            activeDistrictName: this.document.getElementById("active-district-name"),
            activeDistrictCopy: this.document.getElementById("active-district-copy"),
            districtStatus: this.document.getElementById("district-status"),
            districtHustleCount: this.document.getElementById("district-hustle-count"),
            districtRequirementCopy: this.document.getElementById("district-requirement-copy"),
            effects: this.document.getElementById("active-effects"),
            rewardTray: this.document.getElementById("reward-tray"),
            hustleList: this.document.getElementById("hustle-list"),
            districtList: this.document.getElementById("district-list"),
            missionList: this.document.getElementById("mission-list"),
            journalList: this.document.getElementById("journal-list"),
            rewardList: this.document.getElementById("reward-list"),
            achievementList: this.document.getElementById("achievement-list"),
            installPanel: this.document.getElementById("install-panel"),
            studioPanel: this.document.getElementById("studio-panel"),
            studioName: this.document.getElementById("studio-name"),
            navButtons: [...this.document.querySelectorAll(".nav-button")],
            stageScreens: [...this.document.querySelectorAll(".stage-screen")],
            toastRegion: this.document.getElementById("toast-region"),
            modalBackdrop: this.document.getElementById("modal-backdrop"),
            modalLabel: this.document.getElementById("modal-label"),
            modalTitle: this.document.getElementById("modal-title"),
            modalBody: this.document.getElementById("modal-body"),
            modalActions: this.document.getElementById("modal-actions")
        };
    }

    bindHandlers(handlers) {
        this.handlers = handlers;

        this.document.getElementById("start-button").addEventListener("click", () => handlers.onStart());
        this.refs.continueButton.addEventListener("click", () => handlers.onContinue());
        this.refs.installButton.addEventListener("click", () => handlers.onInstall());
        this.document.getElementById("open-map-button").addEventListener("click", () => handlers.onNavigate("districts"));
        this.document.getElementById("save-button").addEventListener("click", () => handlers.onSave());

        this.refs.navButtons.forEach((button) => {
            button.addEventListener("click", () => handlers.onNavigate(button.dataset.target));
        });

        this.document.body.addEventListener("click", (event) => {
            const target = event.target.closest("[data-action]");
            if (!target) {
                return;
            }

            const { action, hustleId, rewardId, districtId } = target.dataset;

            switch (action) {
                case "manual-hustle":
                    handlers.onManualHustle(hustleId);
                    break;
                case "buy-hustle":
                    handlers.onBuyHustle(hustleId);
                    break;
                case "open-track":
                    handlers.onOpenTrack(hustleId);
                    break;
                case "claim-reward":
                    handlers.onClaimReward(rewardId);
                    break;
                case "select-district":
                    handlers.onSelectDistrict(districtId);
                    break;
                case "sync-cloud":
                    handlers.onSync();
                    break;
                case "save-progress":
                    handlers.onSave();
                    break;
                case "reset-progress":
                    handlers.onReset();
                    break;
                case "return-landing":
                    handlers.onReturnToLanding();
                    break;
                case "install-app":
                    handlers.onInstall();
                    break;
                default:
                    break;
            }
        });
    }

    showLanding() {
        this.refs.landingScreen.classList.add("active");
        this.refs.landingScreen.classList.remove("hidden");
        this.refs.gameShell.classList.add("hidden");
    }

    showGame() {
        this.refs.landingScreen.classList.remove("active");
        this.refs.landingScreen.classList.add("hidden");
        this.refs.gameShell.classList.remove("hidden");
    }

    setStage(stage) {
        this.currentStage = stage;
        this.refs.stageScreens.forEach((screen) => screen.classList.toggle("active", screen.dataset.stage === stage));
        this.refs.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.target === stage));
    }

    render(viewModel) {
        this.refs.continueButton.classList.toggle("hidden", !viewModel.hasSave);
        this.refs.installButton.classList.toggle("hidden", viewModel.install.standalone);
        this.refs.installButton.textContent = viewModel.install.canInstall ? "Install App" : "Install Guide";

        const installHint = viewModel.install.showIosHint
            ? "On iPhone or iPad, tap Share then Add to Home Screen to install Street Hustle."
            : viewModel.install.canInstall && !viewModel.install.standalone
                ? "Install Street Hustle for faster relaunch, offline play, and a one-time install reward."
                : "";

        if (installHint) {
            this.refs.installHint.classList.remove("hidden");
            this.refs.installHint.textContent = installHint;
        } else {
            this.refs.installHint.classList.add("hidden");
            this.refs.installHint.textContent = "";
        }

        this.updateResourceCard("cash", this.refs.cashDisplay, viewModel.resources.cash, viewModel.resources.cashRaw);
        this.updateResourceCard("streetCred", this.refs.credDisplay, viewModel.resources.streetCred, viewModel.resources.streetCredRaw);
        this.updateResourceCard("income", this.refs.incomeDisplay, viewModel.resources.income, viewModel.resources.incomeRaw);
        this.updateResourceCard("totalEarned", this.refs.earnedDisplay, viewModel.resources.totalEarned, viewModel.resources.totalEarnedRaw);
        this.refs.networkPill.textContent = viewModel.online ? "Online" : "Offline-safe save";
        this.refs.syncPill.textContent = this.describeSync(viewModel.cloudStatus);

        if (viewModel.activeMission) {
            this.refs.activeMissionTitle.textContent = viewModel.activeMission.title;
            this.refs.activeMissionCopy.textContent = viewModel.activeMission.description;
            this.refs.activeMissionTag.textContent = viewModel.activeMission.tag;
            this.refs.activeMissionProgress.style.width = `${Math.round(viewModel.activeMission.progress * 100)}%`;
            this.refs.activeMissionMeta.textContent = viewModel.activeMission.meta;
        } else {
            this.refs.activeMissionTitle.textContent = "No mission selected";
            this.refs.activeMissionCopy.textContent = "Claim your ready rewards and push into the next district.";
            this.refs.activeMissionTag.textContent = "Momentum";
            this.refs.activeMissionProgress.style.width = "100%";
            this.refs.activeMissionMeta.textContent = "Everything active has been cleared.";
        }

        this.refs.activeDistrictName.textContent = viewModel.activeDistrict.name;
        this.refs.activeDistrictCopy.textContent = viewModel.activeDistrict.description;
        this.refs.districtStatus.textContent = "Unlocked";
        this.refs.districtHustleCount.textContent = `${viewModel.activeDistrict.hustleCount} hustles available in this district`;
        this.refs.districtRequirementCopy.textContent = viewModel.activeDistrict.requirementCopy;

        this.renderEffects(viewModel.activeEffects);
        this.refs.rewardTray.innerHTML = this.renderRewards(viewModel.rewardTray, true);
        this.refs.hustleList.innerHTML = this.renderHustles(viewModel.hustles);
        this.refs.districtList.innerHTML = this.renderDistricts(viewModel.districts);
        this.refs.missionList.innerHTML = this.renderMissions(viewModel.missions);
        this.refs.journalList.innerHTML = this.renderJournal(viewModel.journal);
        this.refs.rewardList.innerHTML = this.renderRewards(viewModel.rewards, false);
        this.refs.achievementList.innerHTML = this.renderAchievements(viewModel.achievements);
        this.refs.installPanel.innerHTML = this.renderInstallPanel(viewModel.installPanel, viewModel.install);
        this.refs.studioName.textContent = viewModel.studio.companyName;
        this.refs.studioPanel.innerHTML = this.renderStudio(viewModel.studio);
    }

    renderEffects(effects) {
        if (!effects.length) {
            this.refs.effects.classList.add("hidden");
            this.refs.effects.innerHTML = "";
            return;
        }

        this.refs.effects.classList.remove("hidden");
        this.refs.effects.innerHTML = effects.map((effect) => `<span class="effect-chip">${effect.label} • ${effect.timeLeft}</span>`).join("");
    }

    updateResourceCard(key, valueRef, formattedValue, rawValue) {
        const card = valueRef.closest(".resource-card");
        const previousValue = this.previousResourceValues[key];
        valueRef.textContent = formattedValue;

        if (!card || previousValue === undefined || previousValue === rawValue) {
            this.previousResourceValues[key] = rawValue;
            return;
        }

        const delta = rawValue - previousValue;
        if (delta === 0) {
            this.previousResourceValues[key] = rawValue;
            return;
        }

        const trendClass = delta > 0 ? "resource-card-updated-up" : "resource-card-updated-down";
        card.classList.remove("resource-card-updated-up", "resource-card-updated-down");
        card.dataset.delta = this.describeResourceDelta(key, delta);
        void card.offsetWidth;
        card.classList.add(trendClass);

        const existingTimer = this.resourceFlashTimers.get(key);
        if (existingTimer) {
            window.clearTimeout(existingTimer);
        }

        this.resourceFlashTimers.set(key, window.setTimeout(() => {
            card.classList.remove("resource-card-updated-up", "resource-card-updated-down");
            card.dataset.delta = "";
        }, 950));

        this.previousResourceValues[key] = rawValue;
    }

    describeResourceDelta(key, delta) {
        if (key === "streetCred") {
            return `${delta > 0 ? "+" : ""}${delta}`;
        }

        if (key === "income") {
            return `${delta > 0 ? "+" : ""}UGX ${formatMoney(delta)}/s`;
        }

        return `${delta > 0 ? "+" : ""}UGX ${formatMoney(delta)}`;
    }

    renderRewards(rewards, compact) {
        if (!rewards.length) {
            return `<div class="empty-state">${compact ? "No rewards ready yet. Finish missions to load the tray." : "No rewards are waiting right now."}</div>`;
        }

        return rewards.map((reward) => `
            <article class="reward-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">${reward.tag}</p>
                        <h2>${reward.title}</h2>
                    </div>
                </div>
                <p class="panel-copy">${reward.description}</p>
                <div class="reward-meta">
                    <span>${reward.rewardSummary}</span>
                </div>
                <div class="reward-actions">
                    <button class="button button-primary" data-action="claim-reward" data-reward-id="${reward.id}">Claim Reward</button>
                </div>
            </article>
        `).join("");
    }

    renderHustles(hustles) {
        return hustles.map((hustle) => `
            <article class="hustle-card">
                <div class="hustle-header">
                    <div class="hustle-icon">${hustle.icon}</div>
                    <div class="hustle-meta">
                        <p class="panel-label">${hustle.isUnlocked ? "Active Hustle" : "Locked Hustle"}</p>
                        <h3 class="hustle-name">${hustle.name}</h3>
                        <p class="hustle-story">${hustle.story}</p>
                    </div>
                    <span class="tag ${hustle.isUnlocked ? "tag-emerald" : "tag-warm"}">Lvl ${hustle.level}</span>
                </div>
                <div class="metric-row">
                    <span>Income: ${hustle.incomeLabel}</span>
                    <span>Manual: ${hustle.manualLabel}</span>
                    <span>${hustle.automationLabel}</span>
                </div>
                ${hustle.isAutomated ? `
                    <div class="progress-shell mini-progress">
                        <div class="progress-bar" style="width:${Math.round(hustle.automationProgress * 100)}%"></div>
                    </div>
                ` : ""}
                ${hustle.trackLabel ? `
                    <div class="stack-card">
                        <p class="panel-label">Selected Track</p>
                        <h3 class="stack-title">${hustle.trackLabel}</h3>
                        <p class="stack-copy">${hustle.trackDescription}</p>
                    </div>
                ` : hustle.trackReady ? `
                    <div class="stack-card">
                        <p class="panel-label">Track Ready</p>
                        <p class="stack-copy">Choose a specialization to shape how this hustle scales next.</p>
                    </div>
                ` : ""}
                <p class="stack-copy">${hustle.isUnlocked || hustle.canUnlock ? hustle.description : hustle.unlockText}</p>
                <div class="hustle-actions">
                    <button class="button button-secondary" data-action="manual-hustle" data-hustle-id="${hustle.id}" ${!hustle.isUnlocked ? "disabled" : ""}>Hustle ${hustle.manualLabel}</button>
                    <button class="button ${hustle.canAfford && (hustle.isUnlocked || hustle.canUnlock) ? "button-primary" : "button-secondary"}" data-action="buy-hustle" data-hustle-id="${hustle.id}" ${(!hustle.isUnlocked && !hustle.canUnlock) || !hustle.canAfford ? "disabled" : ""}>${hustle.costLabel}</button>
                    ${hustle.trackReady ? `<button class="button button-ghost" data-action="open-track" data-hustle-id="${hustle.id}">Choose Track</button>` : ""}
                </div>
                ${!hustle.isUnlocked ? `<p class="progress-copy">${hustle.unlockText}</p>` : ""}
            </article>
        `).join("");
    }

    renderDistricts(districts) {
        return districts.map((district) => `
            <article class="district-tile ${district.unlocked ? "" : "locked"} ${district.active ? "active" : ""}">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">${district.unlocked ? "Unlocked District" : "Locked District"}</p>
                        <h2>${district.name}</h2>
                    </div>
                    <span class="tag ${district.unlocked ? "tag-emerald" : "tag-warm"}">${district.unlocked ? (district.active ? "Active" : "Travel") : "Locked"}</span>
                </div>
                <p class="panel-copy">${district.subtitle}</p>
                <p class="journal-copy">${district.description}</p>
                <div class="district-criteria">
                    <span>${district.criteria}</span>
                    <span>${district.hustles} hustles</span>
                </div>
                ${district.unlocked ? `<button class="button ${district.active ? "button-secondary" : "button-primary"}" data-action="select-district" data-district-id="${district.id}" ${district.active ? "disabled" : ""}>${district.active ? "Current District" : "Travel Here"}</button>` : ""}
            </article>
        `).join("");
    }

    renderMissions(missions) {
        if (!missions.length) {
            return `<div class="empty-state">No missions to show.</div>`;
        }

        return missions.map((mission) => `
            <article class="stack-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">${mission.tag}</p>
                        <h3 class="stack-title">${mission.title}</h3>
                    </div>
                    <span class="tag ${mission.ready ? "tag-emerald" : mission.claimed ? "tag-emerald" : "tag-warm"}">${mission.ready ? "Reward Ready" : mission.claimed ? "Claimed" : "In Progress"}</span>
                </div>
                <p class="stack-copy">${mission.description}</p>
                <div class="progress-shell mini-progress">
                    <div class="progress-bar" style="width:${Math.round(mission.progress * 100)}%"></div>
                </div>
                <p class="progress-copy">${mission.progressText}</p>
            </article>
        `).join("");
    }

    renderJournal(entries) {
        if (!entries.length) {
            return `<div class="empty-state">Your journal will fill as the story moves.</div>`;
        }

        return entries.map((entry) => `
            <article class="stack-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">${entry.type}</p>
                        <h3 class="stack-title">${entry.title}</h3>
                    </div>
                </div>
                <p class="journal-copy">${entry.body}</p>
                <div class="stack-meta">
                    <span>${entry.createdLabel}</span>
                </div>
            </article>
        `).join("");
    }

    renderAchievements(achievements) {
        if (!achievements.length) {
            return `<div class="empty-state">No achievements configured.</div>`;
        }

        return achievements.map((achievement) => `
            <article class="stack-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">Achievement</p>
                        <h3 class="stack-title">${achievement.title}</h3>
                    </div>
                    <span class="tag ${achievement.ready ? "tag-emerald" : achievement.claimed ? "tag-emerald" : "tag-warm"}">${achievement.ready ? "Reward Ready" : achievement.claimed ? "Claimed" : "Tracking"}</span>
                </div>
                <p class="stack-copy">${achievement.description}</p>
                <div class="progress-shell mini-progress">
                    <div class="progress-bar" style="width:${Math.round(achievement.progress * 100)}%"></div>
                </div>
                <p class="progress-copy">${achievement.progressText}</p>
                <div class="stack-meta">
                    <span>${achievement.rewardSummary}</span>
                </div>
            </article>
        `).join("");
    }

    renderInstallPanel(installPanel, install) {
        const guide = installPanel.guide;
        const capabilityBadges = guide.capabilities.map((capability) => `<span class="guide-chip">${capability}</span>`).join("");
        const guideSteps = guide.steps.map((step) => `<li>${step}</li>`).join("");
        const progressSteps = installPanel.progressGuide.map((step) => `<li>${step}</li>`).join("");
        const offlineLabel = installPanel.offlineReady
            ? "Offline cache ready"
            : installPanel.serviceWorkerSupported ? "Offline cache preparing" : "Offline cache depends on browser support";
        const offlineTone = installPanel.offlineReady ? "tag-emerald" : installPanel.serviceWorkerSupported ? "tag-warm" : "tag-danger";

        return `
            <article class="stack-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">Save Mode</p>
                        <h3 class="stack-title">${installPanel.syncLabel}</h3>
                    </div>
                </div>
                <div class="guide-badges">
                    <span class="tag ${offlineTone}">${offlineLabel}</span>
                    <span class="tag ${install.rewardClaimed ? "tag-emerald" : "tag-warm"}">${install.rewardClaimed ? "Install reward claimed" : "Install reward waiting"}</span>
                </div>
                <p class="stack-copy">Daily streak: ${installPanel.streak} day${installPanel.streak === 1 ? "" : "s"}.</p>
                <p class="progress-copy">Last cloud sync: ${installPanel.lastSync}</p>
                <div class="reward-actions">
                    ${!install.standalone ? `<button class="button button-primary" data-action="install-app">${install.canInstall ? "Install App" : "Install Guide"}</button>` : ""}
                    <button class="button button-secondary" data-action="save-progress">Save Progress</button>
                    <button class="button button-secondary" data-action="sync-cloud" ${!installPanel.online ? "disabled" : ""}>Sync Cloud Save</button>
                    <button class="button button-ghost" data-action="return-landing">Back To Landing</button>
                    <button class="button button-ghost" data-action="reset-progress">Reset Progress</button>
                </div>
                ${install.showIosHint ? `<p class="progress-copy">iOS install: use Safari Share → Add to Home Screen.</p>` : ""}
            </article>
            <article class="stack-card guide-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">This Device</p>
                        <h3 class="stack-title">${guide.headline}</h3>
                    </div>
                    <span class="tag ${guide.supportTone}">${guide.supportLabel}</span>
                </div>
                <p class="stack-copy">${guide.browserLabel} on ${guide.deviceLabel}.</p>
                <div class="guide-badges">
                    <span class="guide-chip guide-chip-strong">${guide.browserLabel}</span>
                    <span class="guide-chip guide-chip-strong">${guide.deviceLabel}</span>
                    ${capabilityBadges}
                </div>
                <ol class="guide-list">
                    ${guideSteps}
                </ol>
                <p class="progress-copy">${guide.fallback}</p>
            </article>
            <article class="stack-card guide-card">
                <div class="panel-head">
                    <div>
                        <p class="panel-label">How To Play</p>
                        <h3 class="stack-title">How the game progresses</h3>
                    </div>
                </div>
                <ol class="guide-list">
                    ${progressSteps}
                </ol>
            </article>
        `;
    }

    renderStudio(studio) {
        const points = studio.aboutPoints.map((point) => `<li>${point}</li>`).join("");
        return `
            <p class="panel-copy">${studio.headline}</p>
            <p>${studio.teamMessage}</p>
            ${studio.teamSignature ? `<p><strong>${studio.teamSignature}</strong></p>` : ""}
            <blockquote class="studio-quote">“Street Hustle is designed to feel local, practical, and worth returning to.”</blockquote>
            <a class="text-link" href="${studio.website}" target="_blank" rel="noopener">${studio.website}</a>
            <ul>${points}</ul>
        `;
    }

    showToast(message, tone = "success") {
        const toast = this.document.createElement("div");
        toast.className = `toast ${tone}`;
        toast.textContent = message;
        this.refs.toastRegion.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 3200);
    }

    showModal({ label = "Street Hustle", title, body, actions }) {
        this.refs.modalLabel.textContent = label;
        this.refs.modalTitle.textContent = title;
        this.refs.modalBody.innerHTML = body;
        this.refs.modalActions.innerHTML = actions.map((action) => `
            <button class="${buttonClass(action.variant)}" data-modal-action="${action.id}" ${action.disabled ? "disabled" : ""}>${action.label}</button>
        `).join("");

        this.refs.modalBackdrop.classList.remove("hidden");
        this.refs.modalBackdrop.setAttribute("aria-hidden", "false");

        return new Promise((resolve) => {
            this.modalResolver = resolve;
            const clickHandler = (event) => {
                const button = event.target.closest("[data-modal-action]");
                if (!button) {
                    return;
                }

                const actionId = button.dataset.modalAction;
                this.hideModal();
                resolve(actionId);
                this.refs.modalActions.removeEventListener("click", clickHandler);
            };

            this.refs.modalActions.addEventListener("click", clickHandler);
        });
    }

    hideModal() {
        this.refs.modalBackdrop.classList.add("hidden");
        this.refs.modalBackdrop.setAttribute("aria-hidden", "true");
        this.refs.modalBody.innerHTML = "";
        this.refs.modalActions.innerHTML = "";
    }

    describeSync(status) {
        switch (status) {
            case "synced":
                return "Cloud synced";
            case "connected":
                return "Cloud ready";
            default:
                return "Local only";
        }
    }
}
