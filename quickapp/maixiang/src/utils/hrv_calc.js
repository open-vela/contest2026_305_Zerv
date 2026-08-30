/**
 * hrv_calc.js — HRV 计算层（纯 JS，移植自 Zepp OS 版 page/measurement.js）
 * 采集侧改由 service.health subscribeSample(HEART_RATE) 逐秒喂入 pushBpm(bpm)。
 */

export class HRVCalculator {
  constructor() {
    this.rrIntervals = [];
    this.bpmBuffer = [];       // 原始 BPM 序列，用于熵/频段/RSA 计算
    this.isCollecting = false;
    this.filterEnabled = true;
    this.FILTER_WINDOW_SIZE = 7;
    this.FILTER_THRESHOLD = 0.35;
    this.MIN_BPM = 35;
    this.MAX_BPM = 220;
    this.recentValidRR = [];
    this.rawSampleCount = 0;
    this.invalidDataPoints = 0;
    this.rejectedDataPoints = 0;
    this.outlierDataPoints = 0;
    this.consecutiveOutliers = 0;
  }

  bpmToRR(bpm) { return bpm > 0 ? 60000 / bpm : null; }

  // 每收到一条心率样本调用一次
  pushBpm(bpm) {
    if (!this.isCollecting) return false;
    this.rawSampleCount++;

    const value = Number(bpm);
    if (!isFinite(value) || value <= 0 || value === 255 || value < this.MIN_BPM || value > this.MAX_BPM) {
      this.invalidDataPoints++;
      return false;
    }

    this.bpmBuffer.push(value);

    const rr = this.bpmToRR(value);
    if (rr === null) return false;

    if (!this.filterEnabled || this.recentValidRR.length < this.FILTER_WINDOW_SIZE) {
      this.acceptRR(rr);
      return true;
    } else {
      const sorted = this.recentValidRR.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // 既允许真实心率变化，也能过滤明显伪迹。绝对下限避免低心率时阈值过窄。
      const tolerance = Math.max(median * this.FILTER_THRESHOLD, 180);
      if (Math.abs(rr - median) <= tolerance) {
        this.acceptRR(rr);
        return true;
      } else {
        this.outlierDataPoints++;
        this.consecutiveOutliers++;

        // 连续异常通常意味着心率发生了真实变化。第二个连续异常值开始
        // 重新接受，避免旧基准把后续数据永久锁死。
        if (this.consecutiveOutliers >= 2) {
          this.acceptRR(rr);
          this.consecutiveOutliers = 0;
          return true;
        }
        this.rejectedDataPoints++;
        return false;
      }
    }
  }

  acceptRR(rr) {
    this.rrIntervals.push(rr);
    this.recentValidRR.push(rr);
    if (this.recentValidRR.length > this.FILTER_WINDOW_SIZE) this.recentValidRR.shift();
  }

  start() { if (!this.isCollecting) { this.reset(); this.isCollecting = true; } }
  stop() { this.isCollecting = false; }
  reset() {
    this.rrIntervals = [];
    this.bpmBuffer = [];
    this.recentValidRR = [];
    this.rawSampleCount = 0;
    this.invalidDataPoints = 0;
    this.rejectedDataPoints = 0;
    this.outlierDataPoints = 0;
    this.consecutiveOutliers = 0;
  }

  getQuality() {
    const received = this.rawSampleCount;
    const valid = this.rrIntervals.length;
    const acceptedRatio = received > 0 ? valid / received : 0;
    const outlierRatio = received > 0 ? this.outlierDataPoints / received : 0;
    let level = 'unknown';
    if (received >= 30 && valid >= 30) {
      if (acceptedRatio >= 0.8 && outlierRatio < 0.15) level = 'good';
      else if (acceptedRatio >= 0.6) level = 'fair';
      else level = 'poor';
    }
    return {
      received,
      valid,
      acceptedRatio: +acceptedRatio.toFixed(3),
      outlierRatio: +outlierRatio.toFixed(3),
      rejected: this.rejectedDataPoints,
      invalid: this.invalidDataPoints,
      level
    };
  }

  calculateMeanRR(rr) { return rr.length === 0 ? null : rr.reduce((a, b) => a + b, 0) / rr.length; }

  calculateSDNN(rr) {
    if (rr.length < 2) return null;
    const mean = this.calculateMeanRR(rr);
    const sumSq = rr.reduce((s, r) => s + Math.pow(r - mean, 2), 0);
    return Math.sqrt(sumSq / (rr.length - 1));
  }

  // 符号动力学熵 (Pattern Entropy)
  calculatePatternEntropy(bpmSeq) {
    if (bpmSeq.length < 10) return 0;
    const symbols = [];
    for (let i = 1; i < bpmSeq.length; i++) {
      const diff = bpmSeq[i] - bpmSeq[i - 1];
      if (diff > 0) symbols.push('U');
      else if (diff < 0) symbols.push('D');
      else symbols.push('F');
    }
    const patternCount = {};
    let totalPatterns = 0;
    for (let i = 0; i <= symbols.length - 3; i++) {
      const pat = symbols.slice(i, i + 3).join('');
      patternCount[pat] = (patternCount[pat] || 0) + 1;
      totalPatterns++;
    }
    let entropy = 0;
    for (const key in patternCount) {
      const p = patternCount[key] / totalPatterns;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  // 简易带通滤波求 RMS（代替 FFT），提取 LF 与 VLF
  calculateBandRMS(bpmSeq) {
    if (bpmSeq.length < 30) return { lfRms: 0, vlfRms: 0 };

    const vlfWindow = 25;
    const vlfBaseline = [];
    for (let i = 0; i < bpmSeq.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - vlfWindow); j <= Math.min(bpmSeq.length - 1, i + vlfWindow); j++) {
        sum += bpmSeq[j]; count++;
      }
      vlfBaseline.push(sum / count);
    }

    const lfWindow = 7;
    const lfSignal = [];
    for (let i = 0; i < bpmSeq.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - lfWindow); j <= Math.min(bpmSeq.length - 1, i + lfWindow); j++) {
        sum += bpmSeq[j]; count++;
      }
      lfSignal.push((sum / count) - vlfBaseline[i]);
    }

    const lfRms = Math.sqrt(lfSignal.reduce((s, v) => s + v * v, 0) / lfSignal.length);
    const globalMean = bpmSeq.reduce((a, b) => a + b, 0) / bpmSeq.length;
    const vlfRms = Math.sqrt(vlfBaseline.reduce((s, v) => s + Math.pow(v - globalMean, 2), 0) / vlfBaseline.length);

    return { lfRms, vlfRms };
  }

  getHrvMetrics() {
    if (this.rrIntervals.length < 30) return null;
    const rr = this.rrIntervals;
    const meanRR = this.calculateMeanRR(rr);
    const sdnn = this.calculateSDNN(rr);
    const meanHR = meanRR != null ? 60000 / meanRR : null;
    const patternEntropy = this.calculatePatternEntropy(this.bpmBuffer);
    const { lfRms, vlfRms } = this.calculateBandRMS(this.bpmBuffer);

    return {
      sdnn: sdnn != null ? +sdnn.toFixed(2) : null,
      mean_rr: meanRR != null ? +meanRR.toFixed(2) : null,
      mean_hr: meanHR != null ? +meanHR.toFixed(1) : null,
      patternEntropy: +patternEntropy.toFixed(3),
      lfRms: +lfRms.toFixed(2),
      vlfRms: +vlfRms.toFixed(2)
    };
  }
}

// TCM 分段 SDNN + 心率稳定性
export function calcTcmMetrics(rr) {
  if (!rr || rr.length < 2) return null;
  const hrVals = rr.map(r => 60000 / r);
  const hrMean = hrVals.reduce((a, b) => a + b, 0) / hrVals.length;
  const hrStab = Math.sqrt(hrVals.reduce((s, v) => s + Math.pow(v - hrMean, 2), 0) / hrVals.length);
  const segs = []; let acc = 0, srr = [];
  for (let i = 0; i < rr.length; i++) {
    acc += rr[i]; srr.push(rr[i]);
    if (acc >= 60000 && srr.length >= 5) {
      const sm = srr.reduce((a, b) => a + b, 0) / srr.length;
      segs.push(+Math.sqrt(srr.reduce((s, r) => s + Math.pow(r - sm, 2), 0) / (srr.length - 1)).toFixed(2));
      srr = []; acc = 0;
    }
  }
  return { hrStability: +hrStab.toFixed(2), sdnnSegments: segs, rrCount: rr.length };
}

// RSA: 从 BPM 序列提取 E/I ratio（呼吸-心率耦合指数）
export function calcRsaEiRatio(bpmSeq) {
  if (!bpmSeq || bpmSeq.length < 30) return 0;

  // 去趋势：减去 ±5 窗口移动均值，保留呼吸尺度的波动
  const detr = [];
  for (let i = 0; i < bpmSeq.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = Math.max(0, i - 5); j <= Math.min(bpmSeq.length - 1, i + 5); j++) { sum += bpmSeq[j]; cnt++; }
    detr.push(bpmSeq[i] - sum / cnt);
  }

  const peaks = [], troughs = [];
  for (let i = 1; i < detr.length - 1; i++) {
    if (detr[i] > detr[i - 1] && detr[i] >= detr[i + 1]) peaks.push(bpmSeq[i]);
    else if (detr[i] < detr[i - 1] && detr[i] <= detr[i + 1]) troughs.push(bpmSeq[i]);
  }
  if (peaks.length < 2 || troughs.length < 2) return 0;

  const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  const avgTrough = troughs.reduce((a, b) => a + b, 0) / troughs.length;
  if (avgTrough <= 0) return 0;
  return +(avgPeak / avgTrough).toFixed(3);
}
