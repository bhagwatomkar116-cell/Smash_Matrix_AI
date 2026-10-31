/**
 * Smash Pro - Match Statistics & Court Heatmap Tracker
 */

class MatchStatsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = 0;
    this.endTime = 0;
    this.winner = null;
    this.finalScore = { player: 0, ai: 0 };

    this.player = {
      shots: 0,
      smashes: 0,
      drops: 0,
      clears: 0,
      drives: 0,
      serves: 0,
      maxSpeed: 0,
      speedSum: 0,
      unforcedErrors: 0,
      pointsWon: 0
    };

    this.ai = {
      shots: 0,
      smashes: 0,
      drops: 0,
      clears: 0,
      drives: 0,
      serves: 0,
      maxSpeed: 0,
      speedSum: 0,
      unforcedErrors: 0,
      pointsWon: 0
    };

    this.rallies = [];
    this.landings = []; // { x, z, winner }
  }

  startMatch() {
    this.reset();
    this.startTime = Date.now();
  }

  recordShot(hitter, shotType, speedKmh) {
    const target = (hitter === 'player') ? this.player : this.ai;
    target.shots++;
    target.speedSum += speedKmh;
    if (speedKmh > target.maxSpeed) target.maxSpeed = speedKmh;

    if (shotType === 'smash') target.smashes++;
    else if (shotType === 'drop') target.drops++;
    else if (shotType === 'clear') target.clears++;
    else if (shotType === 'drive') target.drives++;
    else if (shotType === 'serve') target.serves++;
  }

  recordRallyEnd(winner, totalShots, landingPos) {
    if (winner === 'player') {
      this.player.pointsWon++;
    } else {
      this.ai.pointsWon++;
    }

    this.rallies.push({
      winner,
      shots: totalShots
    });

    if (landingPos) {
      this.landings.push({
        x: landingPos.x,
        z: landingPos.z,
        winner: winner
      });
    }
  }

  finalizeMatch(winner, pScore, aScore) {
    this.endTime = Date.now();
    this.winner = winner;
    this.finalScore = { player: pScore, ai: aScore };
  }

  getSummary() {
    const durationSec = Math.max(1, Math.round((this.endTime - this.startTime) / 1000));
    const avgRally = this.rallies.length ? (this.rallies.reduce((a, b) => a + b.shots, 0) / this.rallies.length).toFixed(1) : '0';
    const playerAvgSpeed = this.player.shots ? Math.round(this.player.speedSum / this.player.shots) : 0;
    const aiAvgSpeed = this.ai.shots ? Math.round(this.ai.speedSum / this.ai.shots) : 0;

    return {
      durationSeconds: durationSec,
      winner: this.winner,
      finalScore: this.finalScore,
      totalRallies: this.rallies.length,
      averageRallyShots: avgRally,
      player: {
        ...this.player,
        averageSpeed: playerAvgSpeed
      },
      ai: {
        ...this.ai,
        averageSpeed: aiAvgSpeed
      },
      landings: this.landings
    };
  }

  drawHeatmap(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Court Green Background
    ctx.fillStyle = '#0d3824';
    ctx.fillRect(0, 0, w, h);

    // Court White Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const pad = 12;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    // Net line across middle
    ctx.beginPath();
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w / 2, h - pad);
    ctx.stroke();

    // Map court 3D coordinates (X: -3.05 to 3.05, Z: -6.7 to 6.7) to 2D canvas
    const toCanvasX = (z) => pad + ((z + 6.7) / 13.4) * (w - pad * 2);
    const toCanvasY = (x) => pad + ((x + 3.05) / 6.1) * (h - pad * 2);

    // Draw Heatmap Landing Points
    this.landings.forEach(pt => {
      const px = toCanvasX(pt.z);
      const py = toCanvasY(pt.x);

      const grad = ctx.createRadialGradient(px, py, 2, px, py, 14);
      if (pt.winner === 'player') {
        grad.addColorStop(0, 'rgba(0, 230, 118, 0.9)');
        grad.addColorStop(1, 'rgba(0, 230, 118, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 42, 95, 0.9)');
        grad.addColorStop(1, 'rgba(255, 42, 95, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// Global Singleton
window.BadmintonStats = new MatchStatsCollector();

