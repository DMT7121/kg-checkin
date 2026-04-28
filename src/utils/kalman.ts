// Kalman Filter for GPS smoothing - extracted from original HTML source
class KalmanFilter {
  R: number;
  Q: number;
  A: number;
  B: number;
  C: number;
  cov: number;
  x: number;

  constructor(R = 1, Q = 1, A = 1, B = 0, C = 1) {
    this.R = R;
    this.Q = Q;
    this.A = A;
    this.B = B;
    this.C = C;
    this.cov = NaN;
    this.x = NaN;
  }

  filter(z: number, u = 0): number {
    if (isNaN(this.x)) {
      this.x = (1 / this.C) * z;
      this.cov = (1 / this.C) * this.R * (1 / this.C);
    } else {
      const predX = this.A * this.x + this.B * u;
      const predCov = this.A * this.cov * this.A + this.Q;
      const K =
        predCov * this.C * (1 / (this.C * predCov * this.C + this.R));
      this.x = predX + K * (z - this.C * predX);
      this.cov = predCov - K * this.C * predCov;
    }
    return this.x;
  }

  setR(R: number) {
    this.R = R;
  }
}

export default KalmanFilter;
