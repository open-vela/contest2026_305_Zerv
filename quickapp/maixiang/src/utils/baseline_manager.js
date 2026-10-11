/**
 * baseline_manager.js — 个人基线共享层
 * 移植自 Zepp OS 版 utils/baseline_manager.js（openvela 适配：日期补零手写、
 * 仅读会话历史记录，全部 HRVStorage 接口 Vela 版已具备）。
 *
 * 职责边界（只负责"认识这个人"，不负责评级/文案）：
 *  - 稳健统计：中位数 + MAD（带物理下限，防极稳定用户微小波动爆表）
 *  - 特征提取：从一条测量记录抽取基线相关特征，质量不合格返回 null
 *  - 历史收集：按日读取近 N 天记录
 *  - 基线构建：合格特征池 → { 指标: { med, mad } }
 *
 * 消费方：主诊断引擎(pulse_diagnosis) 同步读会话缓存做双轨融合；
 * 未刷新 / 样本不足时为 null → 融合权重 w=0，行为与旧版一致（冷启动安全）。
 */

import { HrvStorageManager } from './hrv_storage_manager';

// ── 参数 ──
export const POOL_DAYS = 14;     // 常态窗口（天）
export const QUALITY_GATE = 65;  // 入池质量门槛
// MAD 物理下限（防除小数爆表）
export const MAD_FLOOR = { hr: 2.0, rhythm: 0.5, delta: 1.5, stress: 8 };
// 人群先验（会话基线经验贝叶斯收缩）：薄样本时把个人常态向人群常值拉，防少数点带偏。
export const SESSION_PRIOR = { hr: { med: 70, mad: 8 }, rhythm: { med: 3, mad: 2 }, delta: { med: 0, mad: 4 }, stress: { med: 40, mad: 18 } };
export const SESSION_SHRINK_K = 4;   // 先验伪样本数；个人样本越多越压过先验
export const MIN_BASELINE_SAMPLES = 5;   // 少于此数不建基线（避免小样本 med/mad 失真）

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// openvela 引擎/字库规避 padStart，统一手写两位补零。
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

export function median(values) {
  if (!values || values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mad(values, med) {
  if (!values || values.length === 0) return 0;
  return median(values.map(v => Math.abs(v - med)));
}

// ── 从一条测量记录抽取基线特征；质量不合格或无有效心率返回 null ──
export function extractFeatures(record) {
  if (!record || !record.metrics) return null;
  const m = record.metrics;
  const q = m.signalQuality && m.signalQuality.score != null ? m.signalQuality.score : 72;
  if (typeof q !== 'number' || !isFinite(q) || q < QUALITY_GATE) return null;
  const d = m.dynamics || {};
  const hr = [d.medianHr, m.mean_hr].filter(v => typeof v === 'number' && isFinite(v) && v >= 35 && v <= 220)[0];
  if (hr == null) return null;
  const nonnegative = v => typeof v === 'number' && isFinite(v) && v >= 0 ? v : null;
  return {
    hr: hr,                                                        // 心率水平（从容）
    rhythm: nonnegative(d.hrMad) != null ? d.hrMad : (nonnegative(m.hrStability) == null ? null : m.hrStability * 0.67),
    delta: typeof d.firstLastDelta === 'number' && isFinite(d.firstLastDelta) ? d.firstLastDelta : null,
    stress: typeof m.stress === 'number' && isFinite(m.stress) && m.stress > 0 && m.stress <= 100 ? m.stress : null,
    ts: record.timestamp || 0,
  };
}

// ── 常态统计（中位数 + MAD，带物理下限 + 经验贝叶斯向人群先验收缩）──
export function buildBaseline(features) {
  features = (features || []).filter(f => f && typeof f.hr === 'number' && isFinite(f.hr));
  const n = features.length;
  function stat(getter, floor, prior) {
    const vals = features.map(getter).filter(v => typeof v === 'number' && isFinite(v));
    const count = vals.length;
    if (!count) return null;
    const rawMed = median(vals);
    const rawMad = mad(vals, rawMed);
    // 收缩：med/mad 各按 n 与先验 K 加权；样本越少越靠先验（新用户基线更保守、不易乱跳）。
    const med = (count * rawMed + SESSION_SHRINK_K * prior.med) / (count + SESSION_SHRINK_K);
    const madBlend = (count * rawMad + SESSION_SHRINK_K * prior.mad) / (count + SESSION_SHRINK_K);
    return { med: med, mad: Math.max(madBlend, floor), n: count };
  }
  return {
    sampleCount: n,
    hr: stat(f => f.hr, MAD_FLOOR.hr, SESSION_PRIOR.hr),
    rhythm: stat(f => f.rhythm, MAD_FLOOR.rhythm, SESSION_PRIOR.rhythm),
    delta: stat(f => f.delta, MAD_FLOOR.delta, SESSION_PRIOR.delta),
    stress: stat(f => f.stress, MAD_FLOOR.stress, SESSION_PRIOR.stress),
  };
}

// ── 收集近 N 天记录（含今天），按日期分组 ──
// 返回 [{ date: 'YYYY-MM-DD', records: [...] }]，日期升序
function collectRecent(storage, days, callback) {
  storage.getTodayData((todayData) => {
    const now = new Date();
    const todayStr = dateKey(now);
    storage.getHistoryIndex((index) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.max(0, days - 1));
      const startStr = dateKey(start);
      // 按自然日过滤，避免稀疏记录把"近14天"扩展为数月。
      const uniq = [];
      (index || []).forEach(d => {
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= startStr && d < todayStr && uniq.indexOf(d) < 0) uniq.push(d);
      });
      uniq.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const wanted = uniq.slice(0, days - 1);
      const groups = [];
      if (todayData && todayData.length) groups.push({ date: todayStr, records: todayData });
      if (wanted.length === 0) {
        groups.sort((a, b) => a.date < b.date ? -1 : 1);
        callback(groups);
        return;
      }
      let loaded = 0;
      wanted.forEach((dateStr) => {
        storage.getHistoryData(dateStr, (dayData) => {
          if (dayData && dayData.length) groups.push({ date: dateStr, records: dayData });
          loaded++;
          if (loaded >= wanted.length) {
            groups.sort((a, b) => a.date < b.date ? -1 : 1);
            callback(groups);
          }
        });
      });
    });
  });
}

// ── 便捷加载：初始化存储 → 收集近 N 天 → 展平 + 质量过滤出合格特征池 ──
// callback(all)，all = [{ date, f }]（日期升序）；消费方自行决定样本不足时的降级。
export function loadFeatures(days, callback) {
  const storage = new HrvStorageManager();
  storage.init(() => {
    collectRecent(storage, days, (groups) => {
      const all = [];
      groups.forEach(g => g.records.forEach(r => {
        const f = extractFeatures(r);
        if (f) all.push({ date: g.date, f: f });
      }));
      all.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.f.ts - b.f.ts);
      callback(all);
    });
  });
}

// ── 会话级基线缓存 ──
let _baselineCache = null;
let _baselineDirty = true;   // 缓存是否需重算（新测量/写盘后置脏）
let _baselineDate = '';
function cacheDate() { const d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

export function getBaseline() { return _baselineCache; }
export function setBaseline(b) { _baselineCache = b || null; }
export function invalidateBaseline() { _baselineDirty = true; }

// 重读近 N 天合格记录 → 构建基线 → 写入会话缓存；callback(baseline)（不足样本为 null）。
export function refreshBaseline(callback) {
  loadFeatures(POOL_DAYS, (all) => {
    _baselineCache = all.length >= MIN_BASELINE_SAMPLES ? buildBaseline(all.map(x => x.f)) : null;
    _baselineDirty = false;
    _baselineDate = cacheDate();
    if (callback) callback(_baselineCache);
  });
}

// 新鲜则直接回缓存（0 读盘），否则重算。页面用它代替每页 refresh，避免重复读盘。
export function ensureBaseline(callback) {
  if (!_baselineDirty && _baselineDate === cacheDate()) { if (callback) callback(_baselineCache); return; }
  refreshBaseline(callback);
}
