import { deepClone, formatDuration, formatMoney, makeId, randomFrom } from "./utils.js";

const SAVE_KEY = "streetHustleSave_v2";
const LEGACY_SAVE_KEY = "streetHustleSave_v1";

function randomEventDelay() {
    return 55000 + Math.floor(Math.random() * 40000);
}

export class GameEngine {
    constructor(content, rewardManager, playFabService) {
        this.content = content;
        this.rewardManager = rewardManager;
        this.playFabService = playFabService;
        this.state = null;
        this.pendingStoryEvent = null;
        this.cloudStatus = "local";
        this.hasSaveFile = false;
        this.continueAvailable = false;
        this.connectedToCloud = false;
    }

    createFreshState(now = Date.now()) {
        const firstDistrict = this.content.districts.find((district) => district.startsUnlocked) || this.content.districts[0];
        const hustles = Object.fromEntries(this.content.hustles.map((hustle) => [
            hustle.id,
            {
                level: hustle.baseCost === 0 ? 1 : 0,
                isUnlocked: hustle.baseCost === 0,
                isAutomated: false,
                automationProgress: 0,
                totalEarned: 0,
                totalManualTaps: 0,
                selectedTrack: null,
                unlockedAt: hustle.baseCost === 0 ? now : null
            }
        ]));

        return {
            version: 2,
            profile: {
                deviceId: this.getOrCreateDeviceId(),
                installRewardClaimed: false,
                lastSeen: null,
                lastSync: null,
                cloudConnected: false
            },
            economy: {
                cash: 500,
                totalEarnings: 0,
                streetCred: 0,
                incomePerSecond: 0,
                activeEffects: []
            },
            progression: {
                unlockedDistrictIds: [firstDistrict.id],
                activeDistrictId: firstDistrict.id,
                completedMissionIds: [],
                claimedMissionIds: [],
                completedAchievementIds: [],
                claimedAchievementIds: [],
                activeSessionQuestIds: [],
                sessionQuestState: {},
                rewardQueue: [],
                journal: [{
                    id: makeId("journal"),
                    title: "The First Step",
                    body: "You begin with one honest hustle and enough room to build something bigger.",
                    createdAt: now,
                    type: "story"
                }],
                streak: {
                    count: 1,
                    lastRewardDate: null
                },
                stats: {
                    manualTaps: 0,
                    rewardsClaimed: 0,
                    eventsResolved: 0,
                    upgradesPurchased: 0
                }
            },
            hustles,
            ui: {
                currentStage: "home",
                tutorialStep: 0,
                dismissedInstallHint: false,
                sessionStats: {
                    startedAt: now,
                    earnings: 0,
                    manualTaps: 0,
                    rewardsClaimed: 0,
                    upgradesPurchased: 0
                }
            },
            meta: {
                saveVersion: 2,
                migratedFromV1: false,
                lastUpdate: now,
                createdAt: now,
                nextEventAt: now + randomEventDelay()
            }
        };
    }

    normalizeState(state, now = Date.now()) {
        const normalized = deepClone(state);
        const fresh = this.createFreshState(now);

        normalized.version = 2;
        normalized.profile = { ...fresh.profile, ...normalized.profile };
        normalized.economy = { ...fresh.economy, ...normalized.economy };
        normalized.progression = {
            ...fresh.progression,
            ...normalized.progression,
            streak: { ...fresh.progression.streak, ...normalized.progression?.streak },
            stats: { ...fresh.progression.stats, ...normalized.progression?.stats },
            rewardQueue: Array.isArray(normalized.progression?.rewardQueue) ? normalized.progression.rewardQueue : [],
            journal: Array.isArray(normalized.progression?.journal) ? normalized.progression.journal : fresh.progression.journal,
            sessionQuestState: normalized.progression?.sessionQuestState || {}
        };
        normalized.ui = {
            ...fresh.ui,
            ...normalized.ui,
            sessionStats: { ...fresh.ui.sessionStats, ...normalized.ui?.sessionStats, startedAt: now }
        };
        normalized.meta = { ...fresh.meta, ...normalized.meta, lastUpdate: now };
        normalized.hustles = normalized.hustles || {};

        for (const hustle of this.content.hustles) {
            const current = normalized.hustles[hustle.id] || {};
            normalized.hustles[hustle.id] = {
                ...fresh.hustles[hustle.id],
                ...current,
                level: current.level ?? fresh.hustles[hustle.id].level
            };
            if (normalized.hustles[hustle.id].level >= hustle.automation.unlockRequirement) {
                normalized.hustles[hustle.id].isAutomated = true;
            }
        }

        if (!Array.isArray(normalized.progression.unlockedDistrictIds) || normalized.progression.unlockedDistrictIds.length === 0) {
            normalized.progression.unlockedDistrictIds = [this.content.districts[0].id];
        }
        if (!normalized.progression.activeDistrictId || !normalized.progression.unlockedDistrictIds.includes(normalized.progression.activeDistrictId)) {
            normalized.progression.activeDistrictId = normalized.progression.unlockedDistrictIds[0];
        }

        normalized.economy.activeEffects = (normalized.economy.activeEffects || []).filter((effect) => effect.expiresAt > now);
        normalized.economy.incomePerSecond = this.calculateIncomePerSecond(normalized);
        return normalized;
    }

    migrateLegacySave(legacy, now = Date.now()) {
        const state = this.createFreshState(now);
        state.meta.migratedFromV1 = true;
        state.meta.createdAt = legacy.gameStartTime || now;
        state.economy.cash = Number(legacy.money || 0);
        state.economy.totalEarnings = Number(legacy.totalEarnings || 0);

        const levelSum = Object.values(legacy.hustles || {}).reduce((total, hustle) => total + (hustle.level || 0), 0);
        state.economy.streetCred = Math.max(8, Math.min(120, Math.floor(state.economy.totalEarnings / 8500) + Math.floor(levelSum / 2)));

        for (const hustle of this.content.hustles) {
            const legacyState = legacy.hustles?.[hustle.id];
            if (!legacyState) {
                continue;
            }

            state.hustles[hustle.id] = {
                ...state.hustles[hustle.id],
                level: legacyState.level || state.hustles[hustle.id].level,
                isUnlocked: legacyState.isUnlocked || (legacyState.level || 0) > 0 || state.hustles[hustle.id].isUnlocked,
                isAutomated: legacyState.isAutomated || (legacyState.level || 0) >= hustle.automation.unlockRequirement,
                automationProgress: legacyState.automationProgress || 0
            };
        }

        const unlockedDistricts = new Set(state.progression.unlockedDistrictIds);
        for (const district of this.content.districts) {
            const districtUnlocked = district.hustleIds.some((hustleId) => state.hustles[hustleId]?.isUnlocked);
            if (districtUnlocked) {
                unlockedDistricts.add(district.id);
            }
        }
        state.progression.unlockedDistrictIds = [...unlockedDistricts];
        state.progression.activeDistrictId = state.progression.unlockedDistrictIds[state.progression.unlockedDistrictIds.length - 1];
        state.progression.journal.unshift({
            id: makeId("journal"),
            title: "Legacy Hustle Loaded",
            body: "Your earlier progress was migrated into the new Street Hustle economy.",
            createdAt: now,
            type: "system"
        });

        return this.normalizeState(state, now);
    }

    async initialize(now = Date.now()) {
        const localSave = localStorage.getItem(SAVE_KEY);
        const legacySave = localStorage.getItem(LEGACY_SAVE_KEY);

        if (localSave) {
            this.state = this.normalizeState(JSON.parse(localSave), now);
            this.hasSaveFile = true;
            this.continueAvailable = true;
        } else if (legacySave) {
            this.state = this.migrateLegacySave(JSON.parse(legacySave), now);
            this.hasSaveFile = true;
            this.continueAvailable = true;
        } else {
            this.state = this.createFreshState(now);
            this.hasSaveFile = false;
            this.continueAvailable = false;
        }

        if (!this.hasSaveFile && navigator.onLine) {
            const loadedCloud = await this.tryLoadCloudSave(now);
            if (loadedCloud) {
                this.state = loadedCloud;
                this.hasSaveFile = true;
                this.continueAvailable = true;
            }
        } else {
            this.connectCloudInBackground();
        }

        this.rewardManager.processVisitRewards(this.state, now);
        this.state.profile.lastSeen = now;
        this.state.economy.incomePerSecond = this.calculateIncomePerSecond(this.state);
        this.rewardManager.evaluateAll(this.state, now);
        this.unlockEligibleDistricts(now);
        this.saveLocal();
        if (legacySave) {
            localStorage.removeItem(LEGACY_SAVE_KEY);
        }

        return this.state;
    }

    async tryLoadCloudSave(now = Date.now()) {
        const connected = await this.playFabService.initialize(this.getOrCreateDeviceId());
        this.connectedToCloud = connected;
        this.state.profile.cloudConnected = connected;
        this.cloudStatus = connected ? "connected" : "local";

        if (!connected) {
            return null;
        }

        try {
            const cloudState = await this.playFabService.loadGameData();
            if (!cloudState) {
                return null;
            }
            this.cloudStatus = "synced";
            return this.normalizeState(cloudState, now);
        } catch (error) {
            console.warn("Cloud load failed:", error);
            this.cloudStatus = "local";
            return null;
        }
    }

    connectCloudInBackground() {
        if (!navigator.onLine || this.connectedToCloud) {
            return Promise.resolve(this.connectedToCloud);
        }

        return this.playFabService.initialize(this.getOrCreateDeviceId())
            .then((connected) => {
                this.connectedToCloud = connected;
                this.state.profile.cloudConnected = connected;
                this.cloudStatus = connected ? "connected" : "local";
                return connected;
            })
            .catch(() => {
                this.cloudStatus = "local";
                return false;
            });
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem("streetHustleDeviceId");
        if (!deviceId) {
            deviceId = `SH${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem("streetHustleDeviceId", deviceId);
        }
        return deviceId;
    }

    saveLocal() {
        this.state.meta.lastUpdate = Date.now();
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
        this.hasSaveFile = true;
    }

    async save({ cloud = true } = {}) {
        this.saveLocal();

        if (cloud && navigator.onLine && this.connectedToCloud) {
            try {
                await this.playFabService.saveGameData(this.state);
                await this.playFabService.submitScore(this.state.economy.totalEarnings);
                this.state.profile.lastSync = Date.now();
                this.cloudStatus = "synced";
            } catch (error) {
                console.warn("Cloud save failed:", error);
                this.cloudStatus = "local";
            }
        }

        return {
            local: true,
            cloud: this.cloudStatus === "synced"
        };
    }

    async syncCloud() {
        if (!navigator.onLine) {
            this.cloudStatus = "local";
            return false;
        }

        if (!this.connectedToCloud) {
            const connected = await this.connectCloudInBackground();
            if (!connected) {
                return false;
            }
        }

        await this.save({ cloud: true });
        return this.cloudStatus === "synced";
    }

    resetProgress() {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(LEGACY_SAVE_KEY);
        this.state = this.createFreshState(Date.now());
        this.pendingStoryEvent = null;
        this.hasSaveFile = false;
        this.continueAvailable = false;
        this.saveLocal();
        return this.state;
    }

    markContinueAvailable() {
        this.continueAvailable = true;
    }

    calculateIncomePerSecond(state = this.state) {
        return this.content.hustles.reduce((total, hustle) => {
            const hustleState = state.hustles[hustle.id];
            if (!hustleState?.isUnlocked || !hustleState?.isAutomated || hustleState.level <= 0) {
                return total;
            }

            return total + (this.getHustleIncome(hustle.id, state) / (this.getAutomationTimer(hustle.id, state) / 1000));
        }, 0);
    }

    getTrackForHustle(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = state.hustles[hustleId];
        if (!hustleState?.selectedTrack) {
            return null;
        }
        return hustle.tracks.find((track) => track.id === hustleState.selectedTrack) || null;
    }

    getMultiplierForHustle(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = state.hustles[hustleId];
        const track = this.getTrackForHustle(hustleId, state);

        let multiplier = 1;
        if (track) {
            multiplier *= track.incomeMultiplier;
        }

        for (const effect of state.economy.activeEffects) {
            if (effect.targetType === "district" && effect.targetId === hustle.districtId) {
                multiplier *= effect.multiplier;
            }
            if (effect.targetType === "hustle" && effect.targetId === hustleId) {
                multiplier *= effect.multiplier;
            }
        }

        return multiplier;
    }

    getAutomationTimer(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const track = this.getTrackForHustle(hustleId, state);
        const speedMultiplier = track?.speedMultiplier || 1;
        return Math.round(hustle.automation.timer * speedMultiplier);
    }

    getHustleIncome(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = state.hustles[hustleId];
        if (!hustleState?.isUnlocked || hustleState.level <= 0) {
            return 0;
        }

        const baseIncome = hustle.baseIncome * hustleState.level;
        return Math.round(baseIncome * this.getMultiplierForHustle(hustleId, state));
    }

    getManualIncome(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = state.hustles[hustleId];
        const level = Math.max(1, hustleState.level);
        const baseIncome = hustle.baseIncome * level * hustle.manualFactor;
        return Math.round(baseIncome * this.getMultiplierForHustle(hustleId, state));
    }

    getHustleCost(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = state.hustles[hustleId];

        if (!hustleState.isUnlocked) {
            return hustle.baseCost;
        }

        return Math.ceil(hustle.baseUpgradeCost * Math.pow(hustle.costMultiplier, Math.max(0, hustleState.level - 1)));
    }

    canUnlockHustle(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        const districtUnlocked = state.progression.unlockedDistrictIds.includes(hustle.unlock.districtId);
        if (!districtUnlocked) {
            return false;
        }

        if (hustle.unlock.previousHustleId) {
            const previous = state.hustles[hustle.unlock.previousHustleId];
            if (!previous || previous.level < hustle.unlock.previousHustleLevel) {
                return false;
            }
        }

        return true;
    }

    getHustleUnlockText(hustleId, state = this.state) {
        const hustle = this.content.hustlesById[hustleId];
        if (state.progression.unlockedDistrictIds.includes(hustle.districtId)) {
            if (hustle.unlock.previousHustleId) {
                const previousConfig = this.content.hustlesById[hustle.unlock.previousHustleId];
                const previousState = state.hustles[hustle.unlock.previousHustleId];
                return `Need ${previousConfig.name} level ${hustle.unlock.previousHustleLevel} (currently ${previousState.level}).`;
            }
            return "Ready to unlock in this district.";
        }

        const district = this.content.districtsById[hustle.districtId];
        const missionComplete = district.requiredMissionId ? state.progression.completedMissionIds.includes(district.requiredMissionId) : true;
        return `Unlock ${district.name} with ${district.requiredStreetCred} Street Cred${missionComplete ? "" : ` and ${this.content.missions.find((mission) => mission.id === district.requiredMissionId)?.title}`}.`;
    }

    tick(now = Date.now()) {
        const delta = now - this.state.meta.lastUpdate;
        this.state.meta.lastUpdate = now;

        this.processAutomation(delta);
        this.expireEffects(now);
        this.state.economy.incomePerSecond = this.calculateIncomePerSecond();

        const newlyQueued = this.rewardManager.evaluateAll(this.state, now);
        const unlockedDistricts = this.unlockEligibleDistricts(now);
        const storyEvent = this.maybeQueueStoryEvent(now);

        return {
            newlyQueued,
            unlockedDistricts,
            storyEvent
        };
    }

    processAutomation(delta) {
        if (delta <= 0) {
            return;
        }

        let earned = 0;

        for (const hustle of this.content.hustles) {
            const hustleState = this.state.hustles[hustle.id];
            if (!hustleState.isUnlocked || !hustleState.isAutomated || hustleState.level <= 0) {
                continue;
            }

            hustleState.automationProgress += delta;
            const timer = this.getAutomationTimer(hustle.id);

            if (hustleState.automationProgress >= timer) {
                const cycles = Math.floor(hustleState.automationProgress / timer);
                const cycleValue = this.getHustleIncome(hustle.id);
                const income = cycles * cycleValue;
                earned += income;
                hustleState.totalEarned += income;
                hustleState.automationProgress %= timer;
            }
        }

        if (earned > 0) {
            this.state.economy.cash += earned;
            this.state.economy.totalEarnings += earned;
            this.state.ui.sessionStats.earnings += earned;
        }
    }

    expireEffects(now) {
        this.state.economy.activeEffects = this.state.economy.activeEffects.filter((effect) => effect.expiresAt > now);
    }

    maybeQueueStoryEvent(now) {
        if (this.pendingStoryEvent || now < this.state.meta.nextEventAt) {
            return null;
        }

        const eligibleEvents = this.content.events.filter((event) => this.isEventEligible(event));
        if (eligibleEvents.length === 0) {
            this.state.meta.nextEventAt = now + randomEventDelay();
            return null;
        }

        this.pendingStoryEvent = randomFrom(eligibleEvents);
        return this.pendingStoryEvent;
    }

    isEventEligible(event) {
        if (!this.state.progression.unlockedDistrictIds.includes(event.districtId)) {
            return false;
        }

        return event.requirements.every((requirement) => this.rewardManager.measureRequirement(this.state, requirement, false).complete);
    }

    resolveStoryChoice(choiceId, now = Date.now()) {
        if (!this.pendingStoryEvent) {
            return null;
        }

        const choice = this.pendingStoryEvent.choices.find((entry) => entry.id === choiceId);
        if (!choice) {
            return null;
        }

        const cashDelta = choice.rewards?.cash || 0;
        if (cashDelta < 0 && this.state.economy.cash < Math.abs(cashDelta)) {
            return {
                success: false,
                message: "You do not have enough cash for that choice."
            };
        }

        this.state.economy.cash += cashDelta;
        this.state.economy.totalEarnings += Math.max(0, cashDelta);
        this.state.economy.streetCred += choice.rewards?.streetCred || 0;
        this.state.ui.sessionStats.earnings += Math.max(0, cashDelta);
        this.state.progression.stats.eventsResolved += 1;

        if (choice.modifier) {
            this.state.economy.activeEffects.push({
                id: makeId("effect"),
                ...choice.modifier,
                expiresAt: now + choice.modifier.durationMs
            });
        }

        this.state.progression.journal.unshift({
            id: makeId("journal"),
            title: this.pendingStoryEvent.title,
            body: choice.outcome,
            createdAt: now,
            type: "event"
        });
        this.state.progression.journal = this.state.progression.journal.slice(0, 18);

        const completedEvent = this.pendingStoryEvent;
        this.pendingStoryEvent = null;
        this.state.meta.nextEventAt = now + randomEventDelay();
        this.state.economy.incomePerSecond = this.calculateIncomePerSecond();
        this.rewardManager.evaluateAll(this.state, now);
        this.unlockEligibleDistricts(now);

        return {
            success: true,
            event: completedEvent,
            choice
        };
    }

    performManualHustle(hustleId, now = Date.now()) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = this.state.hustles[hustleId];
        if (!hustle || !hustleState?.isUnlocked || hustleState.level <= 0) {
            return null;
        }

        const amount = this.getManualIncome(hustleId);
        this.state.economy.cash += amount;
        this.state.economy.totalEarnings += amount;
        this.state.hustles[hustleId].totalEarned += amount;
        this.state.hustles[hustleId].totalManualTaps += 1;
        this.state.progression.stats.manualTaps += 1;
        this.state.ui.sessionStats.manualTaps += 1;
        this.state.ui.sessionStats.earnings += amount;

        const newlyQueued = this.rewardManager.evaluateAll(this.state, now);
        const unlockedDistricts = this.unlockEligibleDistricts(now);

        return {
            amount,
            hustle,
            newlyQueued,
            unlockedDistricts
        };
    }

    purchaseHustle(hustleId, now = Date.now()) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = this.state.hustles[hustleId];
        if (!hustle || !hustleState) {
            return { success: false, message: "That hustle does not exist." };
        }

        if (!hustleState.isUnlocked && !this.canUnlockHustle(hustleId)) {
            return { success: false, message: "That hustle is not ready to unlock yet." };
        }

        const cost = this.getHustleCost(hustleId);
        if (this.state.economy.cash < cost) {
            return { success: false, message: "You need more cash for that move." };
        }

        this.state.economy.cash -= cost;
        this.state.progression.stats.upgradesPurchased += 1;
        this.state.ui.sessionStats.upgradesPurchased += 1;

        let unlockedNew = false;
        let automatedNow = false;

        if (!hustleState.isUnlocked) {
            hustleState.isUnlocked = true;
            hustleState.level = 1;
            hustleState.unlockedAt = now;
            unlockedNew = true;
            this.state.progression.journal.unshift({
                id: makeId("journal"),
                title: `${hustle.name} Unlocked`,
                body: hustle.story,
                createdAt: now,
                type: "unlock"
            });
        } else {
            hustleState.level += 1;
        }

        if (!hustleState.isAutomated && hustleState.level >= hustle.automation.unlockRequirement) {
            hustleState.isAutomated = true;
            automatedNow = true;
            this.state.progression.journal.unshift({
                id: makeId("journal"),
                title: `${hustle.name} Automated`,
                body: "This hustle can now keep earning while you manage the wider empire.",
                createdAt: now,
                type: "automation"
            });
        }

        this.state.progression.journal = this.state.progression.journal.slice(0, 18);
        this.state.economy.incomePerSecond = this.calculateIncomePerSecond();
        const newlyQueued = this.rewardManager.evaluateAll(this.state, now);
        const unlockedDistricts = this.unlockEligibleDistricts(now);

        return {
            success: true,
            cost,
            unlockedNew,
            automatedNow,
            trackReady: hustleState.level >= hustle.trackUnlockLevel && !hustleState.selectedTrack,
            newlyQueued,
            unlockedDistricts
        };
    }

    chooseTrack(hustleId, trackId, now = Date.now()) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = this.state.hustles[hustleId];
        if (!hustle || !hustleState?.isUnlocked) {
            return { success: false, message: "That hustle is not active yet." };
        }
        if (hustleState.level < hustle.trackUnlockLevel) {
            return { success: false, message: "That hustle is not ready for specialization yet." };
        }
        if (hustleState.selectedTrack) {
            return { success: false, message: "This hustle already has a track selected." };
        }

        const track = hustle.tracks.find((entry) => entry.id === trackId);
        if (!track) {
            return { success: false, message: "That track does not exist." };
        }

        hustleState.selectedTrack = trackId;
        this.state.economy.incomePerSecond = this.calculateIncomePerSecond();
        this.state.progression.journal.unshift({
            id: makeId("journal"),
            title: `${hustle.name}: ${track.name}`,
            body: track.description,
            createdAt: now,
            type: "track"
        });
        this.state.progression.journal = this.state.progression.journal.slice(0, 18);
        this.rewardManager.evaluateAll(this.state, now);

        return {
            success: true,
            track
        };
    }

    setActiveDistrict(districtId) {
        if (!this.state.progression.unlockedDistrictIds.includes(districtId)) {
            return false;
        }

        this.state.progression.activeDistrictId = districtId;
        return true;
    }

    unlockEligibleDistricts(now = Date.now()) {
        const unlocked = [];
        for (const district of this.content.districts) {
            if (this.state.progression.unlockedDistrictIds.includes(district.id)) {
                continue;
            }

            const enoughCred = this.state.economy.streetCred >= district.requiredStreetCred;
            const missionClear = !district.requiredMissionId || this.state.progression.completedMissionIds.includes(district.requiredMissionId);

            if (enoughCred && missionClear) {
                this.state.progression.unlockedDistrictIds.push(district.id);
                unlocked.push(district);
                this.state.progression.journal.unshift({
                    id: makeId("journal"),
                    title: `${district.name} Unlocked`,
                    body: district.description,
                    createdAt: now,
                    type: "district"
                });
                this.state.progression.journal = this.state.progression.journal.slice(0, 18);
            }
        }
        return unlocked;
    }

    maybeQueueInstallReward() {
        if (this.state.profile.installRewardClaimed) {
            return null;
        }

        return this.rewardManager.queueSystemReward(
            this.state,
            "install-reward",
            "Install Reward",
            "You installed Street Hustle for fast access and offline play, so you get a one-time momentum boost.",
            { cash: 3500, streetCred: 4 },
            "PWA Reward"
        );
    }

    buildViewModel({ online, canInstall, standalone, showIosHint, installGuide, offlineReady, serviceWorkerSupported }) {
        const missionFeed = this.rewardManager.getMissionFeed(this.state);
        const achievementFeed = this.rewardManager.getAchievementFeed(this.state);
        const rewardQueue = [...this.state.progression.rewardQueue];
        const activeMission = this.pickActiveMission(missionFeed);
        const activeDistrict = this.content.districtsById[this.state.progression.activeDistrictId];
        const districtHustles = activeDistrict.hustleIds.map((hustleId) => this.buildHustleCard(hustleId));
        const nextDistrict = this.content.districts.find((district) => !this.state.progression.unlockedDistrictIds.includes(district.id));
        const nextDistrictMission = nextDistrict?.requiredMissionId
            ? this.content.missions.find((mission) => mission.id === nextDistrict.requiredMissionId)
            : null;
        const startingHustle = this.content.hustles[0];

        return {
            hasSave: this.continueAvailable,
            cloudStatus: this.cloudStatus,
            online,
            install: {
                canInstall,
                standalone,
                showIosHint,
                rewardClaimed: this.state.profile.installRewardClaimed,
                guide: installGuide,
                offlineReady,
                serviceWorkerSupported
            },
            resources: {
                cash: `UGX ${formatMoney(this.state.economy.cash)}`,
                cashRaw: this.state.economy.cash,
                streetCred: this.state.economy.streetCred.toString(),
                streetCredRaw: this.state.economy.streetCred,
                income: `UGX ${formatMoney(this.state.economy.incomePerSecond)}/s`,
                incomeRaw: this.state.economy.incomePerSecond,
                totalEarned: `UGX ${formatMoney(this.state.economy.totalEarnings)}`,
                totalEarnedRaw: this.state.economy.totalEarnings
            },
            activeMission: activeMission ? {
                title: activeMission.title,
                description: activeMission.description,
                tag: activeMission.tag,
                progress: activeMission.progress.progress,
                meta: this.describeProgress(activeMission.progress)
            } : null,
            activeDistrict: {
                id: activeDistrict.id,
                name: activeDistrict.name,
                description: activeDistrict.description,
                subtitle: activeDistrict.subtitle,
                hustleCount: activeDistrict.hustleIds.length,
                requirementCopy: activeDistrict.requiredMissionId
                    ? `${activeDistrict.requiredStreetCred} Street Cred and ${this.content.missions.find((mission) => mission.id === activeDistrict.requiredMissionId)?.title}`
                    : "Already part of your network."
            },
            activeEffects: this.state.economy.activeEffects.map((effect) => ({
                id: effect.id,
                label: effect.label,
                timeLeft: formatDuration(effect.expiresAt - Date.now())
            })),
            rewardTray: rewardQueue.slice(0, 3).map((reward) => ({
                ...reward,
                rewardSummary: this.describeRewards(reward.rewards)
            })),
            hustles: districtHustles,
            districts: this.content.districts.map((district) => this.buildDistrictTile(district.id)),
            missions: missionFeed.slice(0, 8).map((mission) => ({
                id: mission.id,
                title: mission.title,
                description: mission.description,
                tag: mission.tag,
                progress: mission.progress.progress,
                progressText: this.describeProgress(mission.progress),
                ready: mission.rewardReady,
                claimed: mission.claimed
            })),
            journal: this.state.progression.journal.slice(0, 10).map((entry) => ({
                ...entry,
                createdLabel: new Date(entry.createdAt).toLocaleString()
            })),
            rewards: rewardQueue.map((reward) => ({
                ...reward,
                rewardSummary: this.describeRewards(reward.rewards)
            })),
            achievements: achievementFeed.map((achievement) => ({
                id: achievement.id,
                title: achievement.title,
                description: achievement.description,
                rewardSummary: this.describeRewards(achievement.rewards),
                progress: achievement.progress.progress,
                progressText: this.describeProgress(achievement.progress),
                ready: achievement.rewardReady,
                claimed: achievement.claimed
            })),
            installPanel: {
                online,
                canInstall,
                standalone,
                showIosHint,
                guide: installGuide,
                offlineReady,
                serviceWorkerSupported,
                syncLabel: this.cloudStatus === "synced" ? "Cloud sync active" : this.cloudStatus === "connected" ? "Cloud ready" : "Local-first save",
                streak: this.state.progression.streak.count,
                lastSync: this.state.profile.lastSync ? new Date(this.state.profile.lastSync).toLocaleString() : "Not synced yet",
                progressGuide: [
                    `Start with ${startingHustle.name} and keep tapping until your first upgrades start stacking income.`,
                    "Spend cash to unlock more hustles, then push each hustle to automation so routine money keeps flowing.",
                    "Claim missions, achievements, streak rewards, comeback boosts, and the install reward to build Street Cred faster.",
                    nextDistrict
                        ? `Reach ${nextDistrict.requiredStreetCred} Street Cred${nextDistrictMission ? ` and finish ${nextDistrictMission.title}` : ""} to unlock ${nextDistrict.name}.`
                        : "All districts are open now, so your focus shifts to specialization tracks, story events, and squeezing more value from every hustle."
                ]
            },
            studio: this.content.studio
        };
    }

    buildHustleCard(hustleId) {
        const hustle = this.content.hustlesById[hustleId];
        const hustleState = this.state.hustles[hustleId];
        const canUnlock = !hustleState.isUnlocked && this.canUnlockHustle(hustleId);
        const cost = this.getHustleCost(hustleId);
        const canAfford = this.state.economy.cash >= cost;
        const track = this.getTrackForHustle(hustleId);
        const timer = this.getAutomationTimer(hustleId);

        return {
            id: hustle.id,
            icon: hustle.icon,
            name: hustle.name,
            description: hustle.description,
            story: hustle.story,
            level: hustleState.level,
            isUnlocked: hustleState.isUnlocked,
            canUnlock,
            unlockText: this.getHustleUnlockText(hustleId),
            costLabel: hustleState.isUnlocked ? `Upgrade • UGX ${formatMoney(cost)}` : `Unlock • UGX ${formatMoney(cost)}`,
            canAfford,
            incomeLabel: `UGX ${formatMoney(this.getHustleIncome(hustleId))}`,
            manualLabel: `UGX ${formatMoney(this.getManualIncome(hustleId))}`,
            automationLabel: hustleState.isAutomated
                ? `Automated every ${Math.round(timer / 1000)}s`
                : `Automates at level ${hustle.automation.unlockRequirement}`,
            automationProgress: hustleState.isAutomated ? hustleState.automationProgress / timer : 0,
            isAutomated: hustleState.isAutomated,
            trackLabel: track ? track.name : null,
            trackDescription: track ? track.description : null,
            trackReady: hustleState.level >= hustle.trackUnlockLevel && !track,
            trackOptions: hustle.tracks
        };
    }

    buildDistrictTile(districtId) {
        const district = this.content.districtsById[districtId];
        const unlocked = this.state.progression.unlockedDistrictIds.includes(districtId);
        const missionReady = !district.requiredMissionId || this.state.progression.completedMissionIds.includes(district.requiredMissionId);
        return {
            id: district.id,
            name: district.name,
            subtitle: district.subtitle,
            description: district.description,
            unlocked,
            active: district.id === this.state.progression.activeDistrictId,
            criteria: unlocked
                ? "Travel unlocked"
                : `${district.requiredStreetCred} Street Cred${missionReady ? "" : ` + ${this.content.missions.find((mission) => mission.id === district.requiredMissionId)?.title}`}`,
            hustles: district.hustleIds.length
        };
    }

    pickActiveMission(missionFeed) {
        const priority = {
            onboarding: 0,
            district: 1,
            milestone: 2,
            session: 3
        };

        const incomplete = missionFeed.filter((mission) => !mission.claimed && !mission.progress.complete);
        incomplete.sort((a, b) => (priority[a.category] ?? 10) - (priority[b.category] ?? 10));
        return incomplete[0] || missionFeed.find((mission) => mission.rewardReady) || null;
    }

    describeProgress(progress) {
        if (!progress?.requirements?.length) {
            return "No progress needed.";
        }

        return progress.requirements
            .map((entry) => `${entry.current}/${entry.target}${entry.hustleId ? ` ${this.content.hustlesById[entry.hustleId]?.name || ""}` : ""}`)
            .join(" • ");
    }

    describeRewards(rewards = {}) {
        const parts = [];
        if (rewards.cash) {
            parts.push(`UGX ${formatMoney(rewards.cash)}`);
        }
        if (rewards.streetCred) {
            parts.push(`${rewards.streetCred} Street Cred`);
        }
        return parts.join(" + ") || "Momentum boost";
    }
}
