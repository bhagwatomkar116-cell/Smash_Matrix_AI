/**
 * Smash Pro — Tournament Hub Orchestrator & State Manager
 */

class BadmintonApp {
  constructor() {
    this.currentView = 'dashboard';
    this.engine = null;
    this.settings = {
      targetScore: 11,
      difficulty: 'pro',
      theme: 'bwf-green',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'gemma2'
    };

    // User Career Telemetry
    this.user = {
      name: 'Player',
      country: 'IND',
      rankTitle: 'DIAMOND II',
      rp: 1840,
      level: 14,
      xp: 680,
      maxXp: 1000,
      wins: 28,
      losses: 9,
      winStreak: 3
    };

    this.leaderboard = [
      { rank: 1, name: 'Viktor Axelsen', country: 'DEN', rp: 2980, winRate: '88%', form: 'WWWWW' },
      { rank: 2, name: 'Shi Yuqi', country: 'CHN', rp: 2820, winRate: '84%', form: 'WWLWW' },
      { rank: 3, name: 'Kunlavut Vitidsarn', country: 'THA', rp: 2650, winRate: '81%', form: 'LWWWW' },
      { rank: 4, name: 'You (Player)', country: 'IND', rp: 1840, winRate: '75%', form: 'WWLWW', isUser: true },
      { rank: 5, name: 'Lee Zii Jia', country: 'MAS', rp: 1790, winRate: '73%', form: 'WLWWL' },
      { rank: 6, name: 'Kodai Naraoka', country: 'JPN', rp: 1640, winRate: '71%', form: 'WWLLW' },
      { rank: 7, name: 'Anthony Ginting', country: 'INA', rp: 1590, winRate: '69%', form: 'LWLWW' },
      { rank: 8, name: 'Loh Kean Yew', country: 'SGP', rp: 1510, winRate: '67%', form: 'WLLWW' }
    ];

    this.loadUserData();
    this.initUI();
    this.initGestureBridge();

    window.SmashApp = this;
  }

  loadUserData() {
    const saved = localStorage.getItem('smash_user_profile');
    if (saved) {
      try {
        this.user = { ...this.user, ...JSON.parse(saved) };
      } catch (e) {}
    }
    const savedSettings = localStorage.getItem('smash_game_settings');
    if (savedSettings) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      } catch (e) {}
    }
  }

  saveUserData() {
    localStorage.setItem('smash_user_profile', JSON.stringify(this.user));
    localStorage.setItem('smash_game_settings', JSON.stringify(this.settings));
  }

  initUI() {
    this.renderUserProfile();
    this.renderLeaderboard();
    this.bindButtons();
  }

  initGestureBridge() {
    if (window.BadmintonGestureBridge) {
      window.BadmintonGestureBridge.init();
    }
  }

  bindButtons() {
    // Top Nav buttons
    document.querySelectorAll('[data-view-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-view-target');
        this.switchView(target);
        if (window.BadmintonAudio) window.BadmintonAudio.playClick();
      });
    });

    // Start match action
    const btnPlay = document.getElementById('btn-play-match');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        this.startNewMatch();
      });
    }

    // Audio toggle
    const btnSound = document.getElementById('nav-sound-toggle');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        if (window.BadmintonAudio) {
          const isMuted = window.BadmintonAudio.toggleMute();
          btnSound.classList.toggle('active', !isMuted);
          const lbl = btnSound.querySelector('.btn-label');
          if (lbl) lbl.innerText = isMuted ? 'AUDIO OFF' : 'AUDIO ON';
        }
      });
    }

    // MediaPipe Hand Tracker Webcam Toggle
    const btnGesture = document.getElementById('nav-gesture-toggle');
    if (btnGesture) {
      btnGesture.addEventListener('click', async () => {
        if (window.BadmintonGestureBridge) {
          await window.BadmintonGestureBridge.toggleWebcam();
        }
      });
    }

    // Camera Switcher
    document.querySelectorAll('[data-camera-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-camera-mode');
        document.querySelectorAll('[data-camera-mode]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        if (this.engine) this.engine.setCameraMode(mode);
        if (window.BadmintonAudio) window.BadmintonAudio.playClick();
      });
    });

    // Settings Modal
    const modalSettings = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('btn-open-settings');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const saveSettingsBtn = document.getElementById('btn-save-settings');

    if (openSettingsBtn && modalSettings) {
      openSettingsBtn.addEventListener('click', () => {
        this.populateSettingsForm();
        modalSettings.classList.add('active');
        if (window.BadmintonAudio) window.BadmintonAudio.playClick();
      });
    }
    if (closeSettingsBtn && modalSettings) {
      closeSettingsBtn.addEventListener('click', () => {
        modalSettings.classList.remove('active');
      });
    }
    if (saveSettingsBtn && modalSettings) {
      saveSettingsBtn.addEventListener('click', () => {
        this.saveSettingsFromForm();
        modalSettings.classList.remove('active');
        if (window.BadmintonAudio) window.BadmintonAudio.playClick();
      });
    }

    // Post-Match Action Buttons
    const btnRematch = document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => {
        this.startNewMatch();
      });
    }
    const btnBackDash = document.getElementById('btn-back-dashboard');
    if (btnBackDash) {
      btnBackDash.addEventListener('click', () => {
        this.switchView('dashboard');
      });
    }
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view-screen').forEach(view => {
      view.classList.remove('active');
    });

    const activeEl = document.getElementById(`view-${viewName}`);
    if (activeEl) {
      activeEl.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(link => {
      const match = link.getAttribute('data-view-target') === viewName;
      link.classList.toggle('active', match);
    });

    if (viewName === 'arena' && this.engine) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  }

  startNewMatch() {
    this.switchView('arena');

    if (!this.engine) {
      this.engine = new BadmintonEngine('three-canvas-container');
    }

    this.engine.startMatch({
      targetScore: parseInt(this.settings.targetScore) || 11,
      difficulty: this.settings.difficulty,
      theme: this.settings.theme
    });
  }

  showPostMatchAnalytics(winner, pScore, aScore) {
    this.switchView('analytics');

    const isPlayerWin = (winner === 'player');
    if (isPlayerWin) {
      this.user.wins++;
      this.user.winStreak++;
      this.user.rp += 45;
      this.user.xp += 180;
    } else {
      this.user.losses++;
      this.user.winStreak = 0;
      this.user.rp = Math.max(0, this.user.rp - 15);
      this.user.xp += 60;
    }

    if (this.user.xp >= this.user.maxXp) {
      this.user.level++;
      this.user.xp -= this.user.maxXp;
      this.user.maxXp = Math.round(this.user.maxXp * 1.2);
    }

    this.saveUserData();
    this.renderUserProfile();
    this.renderLeaderboard();

    // Summary Banner
    const victoryTitle = document.getElementById('analytics-victory-title');
    const victoryScore = document.getElementById('analytics-victory-score');
    if (victoryTitle) {
      victoryTitle.innerText = isPlayerWin ? 'VICTORY' : 'DEFEAT';
      victoryTitle.className = isPlayerWin ? 'summary-outcome' : 'summary-outcome defeat';
    }
    if (victoryScore) {
      victoryScore.innerText = `YOU ${pScore} — ${aScore} VIKTOR AI`;
    }

    if (isPlayerWin && window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    // Match Stats Telemetry
    if (window.BadmintonStats) {
      const summary = window.BadmintonStats.getSummary();
      this.renderMatchStats(summary);
      window.BadmintonStats.drawHeatmap('court-heatmap-canvas');

      // Trigger Gemma AI Analysis
      this.triggerGemmaAnalysis(summary);
    }
  }

  renderMatchStats(summary) {
    const p = summary.player;
    const a = summary.ai;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setText('stat-p-smashes', p.smashes);
    setText('stat-a-smashes', a.smashes);
    setText('stat-p-speed', `${p.maxSpeed} km/h`);
    setText('stat-a-speed', `${a.maxSpeed} km/h`);
    setText('stat-p-drops', p.drops);
    setText('stat-a-drops', a.drops);
    setText('stat-avg-rally', `${summary.averageRallyShots} shots`);

    const totalSmashes = Math.max(1, p.smashes + a.smashes);
    const smashBar = document.getElementById('bar-smashes-user');
    if (smashBar) smashBar.style.width = `${(p.smashes / totalSmashes) * 100}%`;
  }

  async triggerGemmaAnalysis(summary) {
    const terminal = document.getElementById('gemma-terminal-text');
    if (!terminal) return;

    terminal.innerHTML = 'Executing Gemma 2 tactical sports telemetry parser... <span class="terminal-cursor"></span>';

    if (window.GemmaCoach) {
      await window.GemmaCoach.generateMatchAnalysis(summary, (chunk) => {
        terminal.innerText = chunk;
      });
    }
  }

  renderUserProfile() {
    const elName = document.getElementById('user-profile-name');
    const elRank = document.getElementById('user-profile-rank');
    const elRp = document.getElementById('user-profile-rp');
    const elWins = document.getElementById('user-profile-wins');
    const elLosses = document.getElementById('user-profile-losses');
    const elRate = document.getElementById('user-profile-winrate');
    const elLevel = document.getElementById('user-profile-level');
    const elXpFill = document.getElementById('user-profile-xp-fill');
    const elXpText = document.getElementById('user-profile-xp-text');

    const h2hRp = document.getElementById('h2h-user-rp');
    const h2hWinrate = document.getElementById('h2h-user-winrate');
    const h2hName = document.getElementById('h2h-user-name');

    if (elName) elName.innerText = this.user.name;
    if (h2hName) h2hName.innerText = this.user.name.toUpperCase();
    if (elRank) elRank.innerText = this.user.rankTitle;
    if (elRp) elRp.innerText = this.user.rp.toLocaleString();
    if (h2hRp) h2hRp.innerText = this.user.rp.toLocaleString();
    if (elWins) elWins.innerText = this.user.wins;
    if (elLosses) elLosses.innerText = this.user.losses;

    const totalGames = this.user.wins + this.user.losses;
    const rate = totalGames ? Math.round((this.user.wins / totalGames) * 100) : 0;
    if (elRate) elRate.innerText = `${rate}%`;
    if (h2hWinrate) h2hWinrate.innerText = `${rate}%`;

    if (elLevel) elLevel.innerText = `LVL ${this.user.level}`;
    if (elXpFill) elXpFill.style.width = `${(this.user.xp / this.user.maxXp) * 100}%`;
    if (elXpText) elXpText.innerText = `${this.user.xp} / ${this.user.maxXp} XP`;
  }

  renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-items');
    if (!tbody) return;

    const userRow = this.leaderboard.find(r => r.isUser);
    if (userRow) {
      userRow.rp = this.user.rp;
    }

    this.leaderboard.sort((a, b) => b.rp - a.rp);
    this.leaderboard.forEach((item, idx) => item.rank = idx + 1);

    tbody.innerHTML = this.leaderboard.map(item => `
      <tr class="${item.isUser ? 'active-user-row' : ''}">
        <td class="pos-cell pos-${item.rank}">${item.rank}</td>
        <td>
          <div class="player-info-cell">
            <span class="flag-icon">${item.country}</span>
            <span style="font-weight: 600;">${item.name}</span>
          </div>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--accent-cyan);">
          ${item.rp.toLocaleString()}
        </td>
        <td style="text-align: right; font-family: var(--font-mono); color: var(--text-secondary);">
          ${item.winRate}
        </td>
        <td style="text-align: right;">
          <span class="form-streak">
            ${item.form.split('').map(f => `<span class="${f === 'W' ? 'form-w' : 'form-l'}">${f}</span>`).join('')}
          </span>
        </td>
      </tr>
    `).join('');
  }

  populateSettingsForm() {
    const sScore = document.getElementById('setting-target-score');
    const sDiff = document.getElementById('setting-difficulty');
    const sTheme = document.getElementById('setting-theme');
    const sUrl = document.getElementById('setting-ollama-url');
    const sModel = document.getElementById('setting-ollama-model');

    if (sScore) sScore.value = this.settings.targetScore;
    if (sDiff) sDiff.value = this.settings.difficulty;
    if (sTheme) sTheme.value = this.settings.theme;
    if (sUrl) sUrl.value = this.settings.ollamaUrl;
    if (sModel) sModel.value = this.settings.ollamaModel;
  }

  saveSettingsFromForm() {
    const sScore = document.getElementById('setting-target-score');
    const sDiff = document.getElementById('setting-difficulty');
    const sTheme = document.getElementById('setting-theme');
    const sUrl = document.getElementById('setting-ollama-url');
    const sModel = document.getElementById('setting-ollama-model');

    if (sScore) this.settings.targetScore = parseInt(sScore.value);
    if (sDiff) this.settings.difficulty = sDiff.value;
    if (sTheme) this.settings.theme = sTheme.value;
    if (sUrl) this.settings.ollamaUrl = sUrl.value;
    if (sModel) this.settings.ollamaModel = sModel.value;

    this.saveUserData();

    if (window.GemmaCoach) {
      window.GemmaCoach.setEndpoint(this.settings.ollamaUrl, this.settings.ollamaModel);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new BadmintonApp();
});
