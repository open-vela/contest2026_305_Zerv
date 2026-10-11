/**
 * relative_text.js — 「较你的常态」个体化文案层
 * 移植自 Zepp OS 版 utils/relative_text.js（openvela 适配：getText 走 utils/strings.js）。
 *
 * 双轨融合把六维数值改成相对个人常态的判定；本层用一句不制造焦虑的话讲给用户
 * （标签/脉名保持绝对，个体化叙事交给这里）。
 *
 * 能力边界（诚实原则）：基线只有 hr / rhythm / delta / stress 四个特征，
 * 故只有 rate/rhythm/rsa/tension 能说"较你常态"；strength/width 无基线 → 返回 null。
 * 冷启动/无基线：sampleCount < MIN_BASELINE_SAMPLES 时一律返回 null。
 */

import { getText } from './strings';
import { getBaseline, extractFeatures, MIN_BASELINE_SAMPLES } from './baseline_manager';

function tr(key, fallback) {
  const value = getText(key);
  return value && value !== key ? value : fallback;
}

// 维度 → 基线特征 + 中文兜底（msgid = dim_relative_<key>_<dir>）
const DIM_FEATURE = { rate: 'hr', rhythm: 'rhythm', rsa: 'delta', tension: 'stress' };
const FALLBACK = {
  rate_below: '心跳比平时慢一些',
  rate_within: '心跳和平时差不多',
  rate_above: '心跳比平时快一些',
  rhythm_below: '心跳比平时更规律',
  rhythm_within: '心跳和平时一样规律',
  rhythm_above: '心跳比平时稍微有点不规律',
  rsa_below: '测量时，身体比平时更快平静下来',
  rsa_within: '测量时，和平时一样慢慢平静下来',
  rsa_above: '测量时，比平时不太容易平静下来',
  tension_below: '身体比平时放松',
  tension_within: '身体和平时一样，比较放松',
  tension_above: '身体比平时紧张一些',
  steady: '这次的结果和你平时差不多',
};

const BAND = 0.8; // |z| 小于此视为"在常态范围内"

// 是否有可用基线（页面据此决定是否显示"对照常态"区）
export function hasBaseline() {
  const b = getBaseline();
  return !!(b && b.sampleCount >= MIN_BASELINE_SAMPLES);
}

// 计算某维相对常态的方向；不支持/无基线/数据不合格 → null
export function relativeOf(key, metrics) {
  const feat = DIM_FEATURE[key];
  if (!feat || !metrics) return null;
  const base = getBaseline();
  if (!base || base.sampleCount < MIN_BASELINE_SAMPLES || !base[feat] || !(base[feat].mad > 0)) return null;
  const f = extractFeatures({ metrics: metrics });
  if (!f || typeof f[feat] !== 'number' || !isFinite(f[feat]) || !isFinite(base[feat].med) || !isFinite(base[feat].mad)) return null;
  const z = (f[feat] - base[feat].med) / base[feat].mad;
  const dir = z < -BAND ? 'below' : z > BAND ? 'above' : 'within';
  return { dir: dir, z: z };
}

// 六维深度页 / 五脏页用：某维的一句"较你常态"
export function relativeLine(key, metrics) {
  const r = relativeOf(key, metrics);
  if (!r) return null;
  return tr('dim_relative_' + key + '_' + r.dir, FALLBACK[key + '_' + r.dir] || '');
}

// 主报告 headline / 体质页用：取偏离最明显的一维说一句；全在常态内则给"稳"
export function overallRelative(metrics) {
  const base = getBaseline();
  if (!base || base.sampleCount < MIN_BASELINE_SAMPLES) return null;
  const cand = [];
  let observed = 0;
  ['rate', 'rhythm', 'tension', 'rsa'].forEach(function (k) {
    const r = relativeOf(k, metrics);
    if (r) observed++;
    if (r && r.dir !== 'within') cand.push({ k: k, z: r.z, dir: r.dir });
  });
  if (!observed) return null;
  if (cand.length === 0) return tr('relative_steady', FALLBACK.steady);
  cand.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const top = cand[0];
  return tr('dim_relative_' + top.k + '_' + top.dir, FALLBACK[top.k + '_' + top.dir] || '');
}
