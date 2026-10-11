/**
 * hrv_calc.js — HRV 计算层（纯 JS，移植自 Zepp OS 版 page/measurement.js）
 * 采集侧改由 service.health subscribeSample(HEART_RATE) 逐秒喂入 pushBpm(bpm)。
 */

export class HRVCalculator {
  constructor() {
    this.rrIntervals = [];
    this.bpmBuffer = [];       // 原始 BPM 序列，用于熵/频段/RSA 计算
    this.bpmSamples = [];      // { timestamp, bpm }，用于覆盖时长与按真实时间求趋势
    this.isCollecting = false;
    this.duration = 180;       // 本次测量时长（秒），影响质量分归一化
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

  // 每收到一条心率样本调用一次；ts 为该样本时间戳（毫秒），缺省 0 走 1Hz 回退
  pushBpm(bpm, ts) {
    if (!this.isCollecting) return false;
    this.rawSampleCount++;

    const value = Number(bpm);
    if (!isFinite(value) || value <= 0 || value === 255 || value < this.MIN_BPM || value > this.MAX_BPM) {
      this.invalidDataPoints++;
      return false;
    }

    this.bpmBuffer.push(value);
    this.bpmSamples.push({ timestamp: (typeof ts === 'number' && isFinite(ts)) ? ts : 0, bpm: value });

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
    this.bpmSamples = [];
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

  // ── v2 心率动态分析辅助（移植自 Zepp measurement.js） ──
  percentile(values, p) {
    if (!values || values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  median(values) { return this.percentile(values, 0.5); }

  // 三点中位数滤波：仅供动态指标分析，原始 BPM 序列始终保留。
  medianFilter(values) {
    if (!values || values.length < 3) return (values || []).slice();
    return values.map((v, i) => {
      if (i === 0 || i === values.length - 1) return v;
      return this.median([values[i - 1], v, values[i + 1]]);
    });
  }

  calculateDynamics() {
    const raw = this.bpmBuffer.filter(v => typeof v === 'number' && v >= 35 && v <= 220);
    if (raw.length < 10) return null;
    const bpm = this.medianFilter(raw);
    const meanHr = bpm.reduce((a, b) => a + b, 0) / bpm.length;
    const medianHr = this.median(bpm);
    const p10Hr = this.percentile(bpm, 0.10);
    const p90Hr = this.percentile(bpm, 0.90);
    const hrStd = Math.sqrt(bpm.reduce((s, v) => s + Math.pow(v - meanHr, 2), 0) / bpm.length);
    const hrMad = this.median(bpm.map(v => Math.abs(v - medianHr)));
    const diffs = [];
    for (let i = 1; i < bpm.length; i++) diffs.push(bpm[i] - bpm[i - 1]);
    const successiveMad = diffs.length ? this.median(diffs.map(v => Math.abs(v))) : 0;
    const successiveRms = diffs.length ? Math.sqrt(diffs.reduce((s, v) => s + v * v, 0) / diffs.length) : 0;

    // 使用实际样本时间戳；缺时间戳或非单调时回退 1Hz 序号。
    const n = bpm.length;
    const samples = this.bpmSamples.filter(s => s && typeof s.bpm === 'number' && s.bpm >= 35 && s.bpm <= 220);
    const timed = samples.length === n && samples.every((s, i) => typeof s.timestamp === 'number' && isFinite(s.timestamp) && s.timestamp > 0 && (!i || s.timestamp > samples[i - 1].timestamp));
    const times = bpm.map((v, i) => timed ? (samples[i].timestamp - samples[0].timestamp) / 1000 : i);
    const xMean = times.reduce((s, v) => s + v, 0) / n;
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (times[i] - xMean) * (bpm[i] - meanHr);
      denominator += Math.pow(times[i] - xMean, 2);
    }
    const trendSlope = denominator > 0 ? (numerator / denominator) * 60 : 0;
    const span = times[n - 1];
    const edgeSeconds = Math.min(30, Math.max(10, span / 4), (span + 1) / 2);
    const first = bpm.filter((v, i) => times[i] < edgeSeconds);
    const last = bpm.filter((v, i) => times[i] > span - edgeSeconds);
    const firstMean = first.length ? first.reduce((a, b) => a + b, 0) / first.length : meanHr;
    const lastMean = last.length ? last.reduce((a, b) => a + b, 0) / last.length : meanHr;

    return {
      sampleCount: raw.length,
      meanHr: +meanHr.toFixed(1),
      medianHr: +medianHr.toFixed(1),
      p10Hr: +p10Hr.toFixed(1),
      p90Hr: +p90Hr.toFixed(1),
      hrRange90: +(p90Hr - p10Hr).toFixed(1),
      hrStd: +hrStd.toFixed(2),
      hrMad: +hrMad.toFixed(2),
      hrCv: meanHr > 0 ? +(hrStd / meanHr).toFixed(4) : 0,
      successiveMad: +successiveMad.toFixed(2),
      successiveRms: +successiveRms.toFixed(2),
      trendSlope: +trendSlope.toFixed(2),
      firstLastDelta: +(lastMean - firstMean).toFixed(1),
      patternEntropy: +this.calculatePatternEntropy(bpm).toFixed(3)
    };
  }

  calculateSignalQuality() {
    const dur = this.duration || 180;
    const expectedCount = dur;
    const raw = this.bpmBuffer.filter(v => typeof v === 'number' && v >= 35 && v <= 220);
    const validCount = raw.length;
    const validRatio = Math.min(1, validCount / expectedCount);
    let frozen = 0, jumps = 0;
    for (let i = 1; i < raw.length; i++) {
      if (raw[i] === raw[i - 1]) frozen++;
      if (Math.abs(raw[i] - raw[i - 1]) > 12) jumps++;
    }
    const diffCount = Math.max(1, raw.length - 1);
    const freezeRatio = frozen / diffCount;
    const jumpRatio = jumps / diffCount;
    let coverageSeconds = 0;
    if (this.bpmSamples.length >= 2) {
      coverageSeconds = Math.min(dur, Math.max(0,
        (this.bpmSamples[this.bpmSamples.length - 1].timestamp - this.bpmSamples[0].timestamp) / 1000 + 1));
    } else if (validCount > 0) {
      coverageSeconds = Math.min(dur, validCount);
    }
    // 整数 BPM 连续数秒相同很常见，仅在冻结比例超过 60% 后扣分。
    const updateScore = 1 - Math.min(1, Math.max(0, freezeRatio - 0.60) / 0.40);
    const continuityScore = 1 - Math.min(1, jumpRatio / 0.15);
    const coverageScore = Math.min(1, coverageSeconds / Math.max(1, dur - 10));
    const score = Math.round(100 * (
      validRatio * 0.45 + updateScore * 0.20 + continuityScore * 0.20 + coverageScore * 0.15
    ));
    const level = score >= 80 ? 'good' : score >= 65 ? 'fair' : 'poor';
    return {
      expectedCount,
      validCount,
      validRatio: +validRatio.toFixed(3),
      freezeRatio: +freezeRatio.toFixed(3),
      jumpRatio: +jumpRatio.toFixed(3),
      coverageSeconds: +coverageSeconds.toFixed(1),
      rejectedCount: this.rejectedDataPoints,
      score,
      level
    };
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
