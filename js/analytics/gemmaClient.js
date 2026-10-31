/**
 * Smash Pro - Ollama Gemma AI Badminton Coach Client
 * Interfaces directly with Ollama's local Gemma model endpoint (/api/generate)
 * with graceful fallback to high-fidelity simulated sports analytics.
 */

class GemmaCoachClient {
  constructor() {
    this.ollamaUrl = 'http://localhost:11434';
    this.modelName = 'gemma2';
    this.useLiveBackend = true;
    this.isAnalyzing = false;

    // Load persisted settings
    const savedUrl = localStorage.getItem('smash_ollama_url');
    if (savedUrl) this.ollamaUrl = savedUrl;
    const savedModel = localStorage.getItem('smash_ollama_model');
    if (savedModel) this.modelName = savedModel;
  }

  setEndpoint(url, model) {
    this.ollamaUrl = url.trim().replace(/\/$/, '');
    this.modelName = model.trim();
    localStorage.setItem('smash_ollama_url', this.ollamaUrl);
    localStorage.setItem('smash_ollama_model', this.modelName);
  }

  async generateMatchAnalysis(statsSummary, onStreamChunk) {
    this.isAnalyzing = true;

    // 1. Build structured sports performance prompt for Gemma
    const prompt = this.buildPrompt(statsSummary);

    // 2. Try fetching from local Ollama Gemma backend
    if (this.useLiveBackend) {
      try {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

        const response = await fetch(`${this.ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.modelName,
            prompt: prompt,
            stream: true,
            options: {
              temperature: 0.7,
              top_p: 0.9
            }
          }),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.response) {
                fullText += parsed.response;
                if (onStreamChunk) onStreamChunk(fullText);
              }
            } catch (err) {
              // partial chunk
            }
          }
        }

        this.isAnalyzing = false;
        return fullText;
      } catch (err) {
        console.warn("Live Ollama Gemma backend unreachable. Falling back to local simulation.", err);
      }
    }

    // 3. Fallback: High-fidelity badminton analytical AI generation
    const fallbackText = this.generateSimulatedGemmaAnalysis(statsSummary);
    await this.simulateTypewriter(fallbackText, onStreamChunk);
    this.isAnalyzing = false;
    return fallbackText;
  }

  buildPrompt(stats) {
    return `
You are Gemma, an elite Olympic Badminton Head Coach.
Analyze this completed badminton match:
- Final Score: Player ${stats.finalScore.player} - AI Opponent ${stats.finalScore.ai}
- Winner: ${stats.winner === 'player' ? 'Player (Victory)' : 'AI (Defeat)'}
- Total Rallies: ${stats.totalRallies} (Avg rally length: ${stats.averageRallyShots} shots)
- Player Max Smash Speed: ${stats.player.maxSpeed} km/h (Avg speed: ${stats.player.averageSpeed} km/h)
- Player Shot Distribution: Smashes: ${stats.player.smashes}, Drops: ${stats.player.drops}, Clears: ${stats.player.clears}, Drives: ${stats.player.drives}
- AI Opponent Stats: Max Speed ${stats.ai.maxSpeed} km/h, Smashes: ${stats.ai.smashes}, Drops: ${stats.ai.drops}

Provide a concise, professional 3-part tactical breakdown:
1. KEY STRENGTHS & WEAPONS (Highlight their smashes and court coverage)
2. CRITICAL TACTICAL VULNERABILITIES (Where points were conceded)
3. GEMMA'S COACH RECOMMENDATIONS (Specific adjustments for the next match: footwork recovery, cross-court angles, net-kill timing).
Keep it inspiring, sharp, and structured with bullet points.
    `.trim();
  }

  generateSimulatedGemmaAnalysis(stats) {
    const isWin = (stats.winner === 'player');
    const p = stats.player;
    const a = stats.ai;

    const outcomeHeader = isWin 
      ? `🏸 GEMMA AI PERFORMANCE REPORT: DOMINANT VICTORY (${stats.finalScore.player} - ${stats.finalScore.ai})`
      : `🏸 GEMMA AI PERFORMANCE REPORT: HARD-FOUGHT BATTLE (${stats.finalScore.player} - ${stats.finalScore.ai})`;

    const smashEval = p.maxSpeed > 280 
      ? `• Explosive Attack: Clocked peak smash at ${p.maxSpeed} km/h with formidable wrist snap and steep penetration angle.`
      : `• Solid Foundation: Peak shuttle speed reached ${p.maxSpeed} km/h with consistent overhead clearing depth.`;

    const dropEval = p.drops >= 2
      ? `• Deceptive Net Play: ${p.drops} delicate drop shots effectively drew the opponent forward, opening the deep backhand court.`
      : `• Net Game Underutilized: You relied heavily on baseline clears; incorporating slice drops will keep opponents guessing.`;

    const tacticalTip = isWin
      ? `• Continue exploiting quick transition drives to stifle the opponent's counter-attacking rhythm.`
      : `• Focus on center-court split-step recovery immediately after defensive clears to cut off fast corner returns.`;

    return `
${outcomeHeader}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 1. KEY STRENGTHS:
${smashEval}
${dropEval}
• Rally Endurance: Handled an average of ${stats.averageRallyShots} shots per rally across ${stats.totalRallies} intense points.

⚠️ 2. TACTICAL VULNERABILITIES:
• Conceded points when opponent accelerated baseline rallies above ${a.maxSpeed || 290} km/h.
• Defensive coverage on wide forehand lifts exposed open angles for cross-court smashes.

💡 3. GEMMA'S COACH RECOMMENDATIONS FOR NEXT MATCH:
${tacticalTip}
• Hand Gesture Calibration: Keep your hand centered in the webcam frame to shave milliseconds off reaction reaction time!
• Variation: Mix 70% attacking smashes with 30% deceptive tumbling net drops to break defensive resets.
    `.trim();
  }

  async simulateTypewriter(text, onChunk) {
    let current = '';
    const speed = 15; // ms per word
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      current += (i === 0 ? '' : ' ') + words[i];
      if (onChunk) onChunk(current);
      await new Promise(r => setTimeout(r, speed));
    }
  }
}

// Global Singleton
window.GemmaCoach = new GemmaCoachClient();

