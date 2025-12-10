class PlayFabService {
    constructor() {
        this.titleId = "185E33";
        this.playerId = null;
        this.isLoggedIn = false;
        
        // Initialize PlayFab with your title ID
        if (typeof PlayFab !== 'undefined') {
            PlayFab.settings.titleId = this.titleId;
            console.log("PlayFab initialized with Title ID:", this.titleId);
        } else {
            console.error("PlayFab SDK not loaded!");
        }
    }

    /**
     * Login anonymously to PlayFab
     * Uses CustomID as primary method, falls back to DeviceID
     */
    async loginAnonymous() {
        return new Promise((resolve, reject) => {
            const customId = this.getOrCreateDeviceId();
            
            console.log("Attempting PlayFab login...");
            console.log("Title ID:", this.titleId);
            console.log("Custom ID:", customId);
            
            // Try LoginWithCustomID first
            PlayFabClientSDK.LoginWithCustomID({
                TitleId: this.titleId,
                CustomId: customId,
                CreateAccount: true
            }, (result, error) => {
                if (error) {
                    console.error("❌ LoginWithCustomID failed:", error);
                    console.error("Error details:", JSON.stringify(error, null, 2));
                    
                    // Check if it's a title ID issue
                    if (error.errorMessage && error.errorMessage.includes("Title")) {
                        console.error("⚠️ Title ID issue detected. Please verify Title ID: 185E33 in PlayFab dashboard");
                    }
                    
                    reject(error);
                } else if (result) {
                    this.playerId = result.data.PlayFabId;
                    this.isLoggedIn = true;
                    console.log("✅ PlayFab login successful!");
                    console.log("Player ID:", this.playerId);
                    resolve(result);
                }
            });
        });
    }

    /**
     * Save game data to PlayFab cloud
     */
    async saveGameData(gameState) {
        if (!this.isLoggedIn) {
            console.warn("Not logged in to PlayFab. Save skipped.");
            return;
        }

        return new Promise((resolve, reject) => {
            const dataToSave = {
                money: gameState.money.toString(),
                totalEarnings: gameState.totalEarnings.toString(),
                hustles: JSON.stringify(gameState.hustles),
                lastSave: new Date().toISOString()
            };

            console.log("Saving to PlayFab cloud...");

            PlayFabClientSDK.UpdateUserData({
                Data: dataToSave
            }, (result, error) => {
                if (error) {
                    console.error("❌ Failed to save to cloud:", error);
                    reject(error);
                } else if (result) {
                    console.log("✅ Game saved to cloud successfully!");
                    resolve(result);
                }
            });
        });
    }

    /**
     * Load game data from PlayFab cloud
     */
    async loadGameData() {
        if (!this.isLoggedIn) {
            console.warn("Not logged in to PlayFab. Load skipped.");
            return null;
        }

        return new Promise((resolve, reject) => {
            PlayFabClientSDK.GetUserData({
                PlayFabId: this.playerId
            }, (result, error) => {
                if (error) {
                    console.error("❌ Failed to load from cloud:", error);
                    reject(error);
                } else if (result) {
                    const data = result.data.Data;
                    
                    if (!data || Object.keys(data).length === 0) {
                        console.log("No cloud save found");
                        resolve(null);
                        return;
                    }

                    const gameState = {
                        money: parseFloat(data.money?.Value || 0),
                        totalEarnings: parseFloat(data.totalEarnings?.Value || 0),
                        hustles: JSON.parse(data.hustles?.Value || '{}'),
                        lastSave: data.lastSave?.Value
                    };

                    console.log("✅ Game loaded from cloud:", gameState);
                    resolve(gameState);
                }
            });
        });
    }

    /**
     * Submit score to leaderboard
     */
    async submitScore(score) {
        if (!this.isLoggedIn) {
            console.warn("Not logged in to PlayFab. Leaderboard update skipped.");
            return;
        }

        return new Promise((resolve, reject) => {
            PlayFabClientSDK.UpdatePlayerStatistics({
                Statistics: [{
                    StatisticName: "TotalEarnings",
                    Value: Math.floor(score)
                }]
            }, (result, error) => {
                if (error) {
                    console.error("❌ Failed to update leaderboard:", error);
                    reject(error);
                } else if (result) {
                    console.log("✅ Leaderboard updated with score:", Math.floor(score));
                    resolve(result);
                }
            });
        });
    }

    /**
     * Get top players from leaderboard
     */
    async getLeaderboard(maxResults = 10) {
        if (!this.isLoggedIn) {
            console.warn("Not logged in to PlayFab.");
            return null;
        }

        return new Promise((resolve, reject) => {
            PlayFabClientSDK.GetLeaderboard({
                StatisticName: "TotalEarnings",
                StartPosition: 0,
                MaxResultsCount: maxResults
            }, (result, error) => {
                if (error) {
                    console.error("❌ Failed to load leaderboard:", error);
                    reject(error);
                } else if (result) {
                    console.log("✅ Leaderboard loaded:", result.data.Leaderboard);
                    resolve(result.data.Leaderboard);
                }
            });
        });
    }

    /**
     * Get or create a unique device ID for anonymous login
     * Must be 3-100 characters, alphanumeric + underscore
     */
    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('playfab_deviceId');
        
        if (!deviceId) {
            // Create a simpler, guaranteed-valid ID
            const timestamp = Date.now().toString(36); // Convert to base36 for shorter string
            const random = Math.random().toString(36).substring(2, 11); // 9 random chars
            deviceId = `SH${timestamp}${random}`;
            
            localStorage.setItem('playfab_deviceId', deviceId);
            console.log("Created new device ID:", deviceId);
        } else {
            console.log("Using existing device ID:", deviceId);
        }
        
        return deviceId;
    }
}

// Create a single instance to be used throughout the app
const playfabService = new PlayFabService();