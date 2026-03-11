const PLAYFAB_SDK_URL = "https://download.playfab.com/PlayFabClientApi.js";

export class PlayFabService {
    constructor(titleId = "185E33") {
        this.titleId = titleId;
        this.sdkReady = false;
        this.isLoggedIn = false;
        this.playerId = null;
        this.loadingPromise = null;
    }

    async initialize(deviceId) {
        if (!navigator.onLine) {
            return false;
        }

        try {
            await this.loadSdk();
            await this.login(deviceId);
            return true;
        } catch (error) {
            console.warn("PlayFab initialization skipped:", error);
            return false;
        }
    }

    loadSdk() {
        if (this.sdkReady) {
            return Promise.resolve();
        }

        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = new Promise((resolve, reject) => {
            if (window.PlayFabClientSDK) {
                window.PlayFab.settings.titleId = this.titleId;
                this.sdkReady = true;
                resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = PLAYFAB_SDK_URL;
            script.async = true;
            script.onload = () => {
                if (!window.PlayFab || !window.PlayFabClientSDK) {
                    reject(new Error("PlayFab SDK loaded without expected globals."));
                    return;
                }

                window.PlayFab.settings.titleId = this.titleId;
                this.sdkReady = true;
                resolve();
            };
            script.onerror = () => reject(new Error("Unable to load PlayFab SDK."));
            document.head.appendChild(script);
        });

        return this.loadingPromise;
    }

    login(deviceId) {
        return new Promise((resolve, reject) => {
            window.PlayFabClientSDK.LoginWithCustomID({
                TitleId: this.titleId,
                CustomId: deviceId,
                CreateAccount: true
            }, (result, error) => {
                if (error) {
                    reject(error);
                    return;
                }

                this.isLoggedIn = true;
                this.playerId = result.data.PlayFabId;
                resolve(result);
            });
        });
    }

    async loadGameData() {
        if (!this.isLoggedIn) {
            return null;
        }

        return new Promise((resolve, reject) => {
            window.PlayFabClientSDK.GetUserData({
                PlayFabId: this.playerId
            }, (result, error) => {
                if (error) {
                    reject(error);
                    return;
                }

                const data = result.data?.Data;
                if (!data?.saveData?.Value) {
                    resolve(null);
                    return;
                }

                try {
                    resolve(JSON.parse(data.saveData.Value));
                } catch (parseError) {
                    reject(parseError);
                }
            });
        });
    }

    async saveGameData(saveState) {
        if (!this.isLoggedIn) {
            return false;
        }

        return new Promise((resolve, reject) => {
            window.PlayFabClientSDK.UpdateUserData({
                Data: {
                    saveData: JSON.stringify(saveState),
                    lastSave: new Date().toISOString()
                }
            }, (result, error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result);
            });
        });
    }

    async submitScore(score) {
        if (!this.isLoggedIn) {
            return false;
        }

        return new Promise((resolve, reject) => {
            window.PlayFabClientSDK.UpdatePlayerStatistics({
                Statistics: [{
                    StatisticName: "TotalEarnings",
                    Value: Math.floor(score)
                }]
            }, (result, error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result);
            });
        });
    }
}
