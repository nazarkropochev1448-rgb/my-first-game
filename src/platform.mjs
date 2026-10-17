// Replace this adapter when a real platform integration is commissioned.
// No SDK, network calls, ads or fabricated achievements are active here.
export const platform = {
  async init() {
    return {
      provider: "local",
      cloud: false,
      ads: false,
      achievements: false,
      leaderboards: false,
    };
  },
  async loadCloud() {
    return null;
  },
  async saveCloud() {
    return { supported: false };
  },
  async showAd() {
    return { supported: false };
  },
  async unlockAchievement() {
    return { supported: false };
  },
  async submitScore() {
    return { supported: false };
  },
};
