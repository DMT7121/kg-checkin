// Kalman Filter for ultra-fast & high-precision GPS smoothing
class KalmanFilter {
  R: number;
  Q: number;
  A: number;
  B: number;
  C: number;
  cov: number;
  x: number;
  lastTimestamp: number;

  constructor(R = 1, Q = 0.0001, A = 1, B = 0, C = 1) {
    this.R = R;
    this.Q = Q;
    this.A = A;
    this.B = B;
    this.C = C;
    this.cov = NaN;
    this.x = NaN;
    this.lastTimestamp = 0;
  }

  filter(z: number, u = 0, accuracy = 20): number {
    const now = Date.now();
    
    // First measurement initialize
    if (isNaN(this.x)) {
      this.x = (1 / this.C) * z;
      this.cov = (1 / this.C) * this.R * (1 / this.C);
      this.lastTimestamp = now;
      return this.x;
    }

    // Adapt Q and R dynamically based on accuracy
    // High accuracy (<=10m): Trust measurement heavily, converge fast
    if (accuracy <= 10) {
      this.R = Math.max(0.00001, (accuracy * accuracy) / 100000);
      this.Q = 0.001;
    } else if (accuracy <= 25) {
      this.R = Math.max(0.0001, (accuracy * accuracy) / 50000);
      this.Q = 0.0001;
    } else {
      // Coarse / high jitter: Damp measurement noise
      this.R = (accuracy * accuracy) / 10000;
      this.Q = 0.00001;
    }

    const dt = this.lastTimestamp > 0 ? (now - this.lastTimestamp) / 1000 : 1;
    this.lastTimestamp = now;

    // Standard Kalman update
    const predX = this.A * this.x + this.B * u;
    const predCov = this.A * this.cov * this.A + this.Q * Math.max(1, dt);
    const K = predCov * this.C * (1 / (this.C * predCov * this.C + this.R));
    
    // Update state
    this.x = predX + K * (z - this.C * predX);
    this.cov = predCov - K * this.C * predCov;

    return this.x;
  }

  setR(R: number) {
    this.R = R;
  }

  reset() {
    this.cov = NaN;
    this.x = NaN;
    this.lastTimestamp = 0;
  }
}

export default KalmanFilter;

