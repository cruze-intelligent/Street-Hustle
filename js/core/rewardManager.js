import { clamp, dateKey, makeId, randomFrom } from "./utils.js";

function ensureSessionQuestState(state) {
    if (!state.progression.sessionQuestState) {
        state.progression.sessionQuestState = {};
    }
}

function ensureRewardQueue(state) {
    if (!Array.isArray(state.progression.rewardQueue)) {
        state.progression.rewardQueue = [];
    }
}

function currentSessionEntry(state, key) {
    ensureSessionQuestState(state);
    if (!state.progression.sessionQuestState[key]) {
        state.progression.sessionQuestState[key] = {
            activeIds: [],
            completedIds: [],
            claimedIds: []
        };
    }
    return state.progression.sessionQuestState[key];
}

export class RewardManager {
    constructor(content) {
        this.content = content;
    }

    ensureSessionQuests(state, now = Date.now()) {
        const key = dateKey(now);
        const entry = currentSessionEntry(state, key);

        if (entry.activeIds.length === 0) {
            const pool = this.content.missions.filter((mission) => mission.category === "session");
            const chosen = [];
            const remaining = [...pool];

            while (chosen.length < Math.min(3, pool.length)) {
                const picked = randomFrom(remaining);
                if (!picked) {
                    break;
                }
                chosen.push(picked.id);
                remaining.splice(remaining.findIndex((item) => item.id === picked.id), 1);
            }

            entry.activeIds = chosen;
            state.progression.activeSessionQuestIds = [...chosen];
            state.progression.sessionQuestRollKey = key;
        } else {
            state.progression.activeSessionQuestIds = [...entry.activeIds];
            state.progression.sessionQuestRollKey = key;
        }
    }

    evaluateAll(state, now = Date.now()) {
        this.ensureSessionQuests(state, now);
        ensureRewardQueue(state);

        const unlocked = [];
        const sessionKey = state.progression.sessionQuestRollKey || dateKey(now);
        const sessionEntry = currentSessionEntry(state, sessionKey);

        for (const mission of this.content.missions) {
            if (mission.category === "session" && !sessionEntry.activeIds.includes(mission.id)) {
                continue;
            }

            const progress = this.getProgress(state, mission, now);
            const completed = mission.category === "session"
                ? sessionEntry.completedIds.includes(mission.id)
                : state.progression.completedMissionIds.includes(mission.id);
            const claimed = mission.category === "session"
                ? sessionEntry.claimedIds.includes(mission.id)
                : state.progression.claimedMissionIds.includes(mission.id);

            if (progress.complete && !completed) {
                if (mission.category === "session") {
                    sessionEntry.completedIds.push(mission.id);
                } else {
                    state.progression.completedMissionIds.push(mission.id);
                }

                if (mission.journalEntry) {
                    state.progression.journal.unshift({
                        id: makeId("journal"),
                        title: mission.title,
                        body: mission.journalEntry,
                        createdAt: now,
                        type: mission.category
                    });
                    state.progression.journal = state.progression.journal.slice(0, 18);
                }
            }

            if (progress.complete && !claimed) {
                const queued = this.queueReward(state, {
                    sourceType: "mission",
                    sourceId: mission.id,
                    sourceKey: mission.category === "session" ? `${mission.id}:${sessionKey}` : mission.id,
                    title: mission.title,
                    description: mission.description,
                    tag: mission.tag,
                    rewards: mission.rewards
                });

                if (queued) {
                    unlocked.push(queued);
                }
            }
        }

        for (const achievement of this.content.achievements) {
            const progress = this.getProgress(state, achievement, now);
            const completed = state.progression.completedAchievementIds.includes(achievement.id);
            const claimed = state.progression.claimedAchievementIds.includes(achievement.id);

            if (progress.complete && !completed) {
                state.progression.completedAchievementIds.push(achievement.id);
            }

            if (progress.complete && !claimed) {
                const queued = this.queueReward(state, {
                    sourceType: "achievement",
                    sourceId: achievement.id,
                    sourceKey: achievement.id,
                    title: achievement.title,
                    description: achievement.description,
                    tag: achievement.tag,
                    rewards: achievement.rewards
                });

                if (queued) {
                    unlocked.push(queued);
                }
            }
        }

        return unlocked;
    }

    getProgress(state, item) {
        const requirements = item.requirements.map((requirement) => this.measureRequirement(state, requirement, item.category === "session"));
        const progress = requirements.length === 0 ? 1 : Math.min(...requirements.map((entry) => entry.progress));

        return {
            complete: requirements.every((entry) => entry.complete),
            progress: clamp(progress, 0, 1),
            requirements
        };
    }

    measureRequirement(state, requirement, useSessionMetrics = false) {
        const sessionStats = state.ui.sessionStats;
        let current = 0;
        const target = requirement.target ?? 1;

        switch (requirement.type) {
            case "manual_taps":
                current = useSessionMetrics ? sessionStats.manualTaps : state.progression.stats.manualTaps;
                break;
            case "earn_total":
                current = useSessionMetrics ? sessionStats.earnings : state.economy.totalEarnings;
                break;
            case "cash_on_hand":
                current = state.economy.cash;
                break;
            case "hustle_level":
                current = state.hustles[requirement.hustleId]?.level || 0;
                break;
            case "unlock_hustle":
                current = state.hustles[requirement.hustleId]?.isUnlocked ? 1 : 0;
                break;
            case "reach_income":
                current = state.economy.incomePerSecond || 0;
                break;
            case "street_cred":
                current = state.economy.streetCred;
                break;
            case "rewards_claimed":
                current = useSessionMetrics ? sessionStats.rewardsClaimed : state.progression.stats.rewardsClaimed;
                break;
            case "automated_count":
                current = Object.values(state.hustles).filter((hustle) => hustle.isAutomated).length;
                break;
            case "districts_unlocked":
                current = state.progression.unlockedDistrictIds.length;
                break;
            case "hustle_upgrades":
                current = useSessionMetrics ? sessionStats.upgradesPurchased : state.progression.stats.upgradesPurchased;
                break;
            default:
                current = 0;
        }

        const progress = target === 0 ? 1 : clamp(current / target, 0, 1);
        return {
            type: requirement.type,
            hustleId: requirement.hustleId,
            current,
            target,
            progress,
            complete: current >= target
        };
    }

    queueReward(state, reward) {
        ensureRewardQueue(state);
        const exists = state.progression.rewardQueue.some((entry) => entry.sourceType === reward.sourceType && entry.sourceKey === reward.sourceKey);
        if (exists) {
            return null;
        }

        const rewardEntry = {
            id: makeId("reward"),
            createdAt: Date.now(),
            ...reward
        };

        state.progression.rewardQueue.unshift(rewardEntry);
        return rewardEntry;
    }

    queueSystemReward(state, sourceKey, title, description, rewards, tag = "System Reward") {
        return this.queueReward(state, {
            sourceType: "system",
            sourceId: sourceKey,
            sourceKey,
            title,
            description,
            rewards,
            tag
        });
    }

    processVisitRewards(state, now = Date.now()) {
        const previousSeen = state.profile.lastSeen;
        const queue = [];

        if (!previousSeen) {
            state.progression.streak.count = 1;
            return queue;
        }

        const diffDays = Math.max(0, Math.floor((new Date(dateKey(now)) - new Date(dateKey(previousSeen))) / 86400000));
        const todayKey = dateKey(now);

        if (diffDays === 1 && state.progression.streak.lastRewardDate !== todayKey) {
            state.progression.streak.count += 1;
            state.progression.streak.lastRewardDate = todayKey;
            const streakReward = {
                cash: 1200 + (state.progression.streak.count * 300),
                streetCred: Math.min(4, 1 + Math.floor(state.progression.streak.count / 2))
            };
            const queued = this.queueSystemReward(
                state,
                `daily-streak-${todayKey}`,
                "Daily Return Bonus",
                `You kept the streak alive for ${state.progression.streak.count} day${state.progression.streak.count === 1 ? "" : "s"}.`,
                streakReward,
                "Daily Streak"
            );
            if (queued) {
                queue.push(queued);
            }
        } else if (diffDays > 1) {
            state.progression.streak.count = 1;
            state.progression.streak.lastRewardDate = todayKey;
            const comebackReward = {
                cash: Math.min(9000, 2200 + (diffDays * 750)),
                streetCred: Math.min(5, 1 + Math.floor(diffDays / 2))
            };
            const queued = this.queueSystemReward(
                state,
                `comeback-${todayKey}`,
                "Welcome Back",
                "You returned after some time away, so the streets gave you a fresh push.",
                comebackReward,
                "Comeback Bonus"
            );
            if (queued) {
                queue.push(queued);
            }
        }

        return queue;
    }

    claimReward(state, rewardId) {
        const rewardIndex = state.progression.rewardQueue.findIndex((reward) => reward.id === rewardId);
        if (rewardIndex === -1) {
            return null;
        }

        const [reward] = state.progression.rewardQueue.splice(rewardIndex, 1);
        this.applyRewards(state, reward.rewards);

        if (reward.sourceType === "mission") {
            if (reward.sourceKey.includes(":")) {
                const [missionId, key] = reward.sourceKey.split(":");
                const entry = currentSessionEntry(state, key);
                if (!entry.claimedIds.includes(missionId)) {
                    entry.claimedIds.push(missionId);
                }
            } else if (!state.progression.claimedMissionIds.includes(reward.sourceId)) {
                state.progression.claimedMissionIds.push(reward.sourceId);
            }
        }

        if (reward.sourceType === "achievement" && !state.progression.claimedAchievementIds.includes(reward.sourceId)) {
            state.progression.claimedAchievementIds.push(reward.sourceId);
        }

        if (reward.sourceType === "system" && reward.sourceId === "install-reward") {
            state.profile.installRewardClaimed = true;
        }

        state.progression.stats.rewardsClaimed += 1;
        state.ui.sessionStats.rewardsClaimed += 1;

        return reward;
    }

    applyRewards(state, rewards = {}) {
        state.economy.cash += rewards.cash || 0;
        state.economy.totalEarnings += Math.max(0, rewards.cash || 0);
        state.economy.streetCred += rewards.streetCred || 0;
    }

    getMissionFeed(state, now = Date.now()) {
        this.ensureSessionQuests(state, now);
        const sessionKey = state.progression.sessionQuestRollKey || dateKey(now);
        const sessionEntry = currentSessionEntry(state, sessionKey);

        return this.content.missions
            .filter((mission) => mission.category !== "session" || sessionEntry.activeIds.includes(mission.id))
            .map((mission) => ({
                ...mission,
                rewardReady: this.isRewardReady(state, mission, sessionKey),
                claimed: this.isClaimed(state, mission, sessionKey),
                progress: this.getProgress(state, mission, now)
            }))
            .sort((a, b) => {
                const aScore = a.rewardReady ? 0 : a.claimed ? 2 : 1;
                const bScore = b.rewardReady ? 0 : b.claimed ? 2 : 1;
                return aScore - bScore;
            });
    }

    getAchievementFeed(state, now = Date.now()) {
        return this.content.achievements.map((achievement) => ({
            ...achievement,
            rewardReady: this.isAchievementRewardReady(state, achievement),
            claimed: state.progression.claimedAchievementIds.includes(achievement.id),
            progress: this.getProgress(state, achievement, now)
        }));
    }

    isRewardReady(state, mission, sessionKey) {
        const progress = this.getProgress(state, mission);
        if (!progress.complete) {
            return false;
        }
        if (mission.category === "session") {
            return !currentSessionEntry(state, sessionKey).claimedIds.includes(mission.id);
        }
        return !state.progression.claimedMissionIds.includes(mission.id);
    }

    isClaimed(state, mission, sessionKey) {
        if (mission.category === "session") {
            return currentSessionEntry(state, sessionKey).claimedIds.includes(mission.id);
        }
        return state.progression.claimedMissionIds.includes(mission.id);
    }

    isAchievementRewardReady(state, achievement) {
        const progress = this.getProgress(state, achievement);
        return progress.complete && !state.progression.claimedAchievementIds.includes(achievement.id);
    }
}
