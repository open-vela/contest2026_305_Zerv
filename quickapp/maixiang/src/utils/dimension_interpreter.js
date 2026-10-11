/**
 * dimension_interpreter.js — 维度解读模型
 * 移植自 Zepp OS 版 utils/dimension_interpreter.js（openvela 适配：
 * getText 走 utils/strings.js；去可选链 ?. 与模板串，改 ES5 形式）。
 * 消费方：pages/dim_interpretation。
 */
import { getText } from './strings';
import { relativeLine } from './relative_text';

const NAMES = { rate: 'dim_rate', rhythm: 'dim_rhythm', strength: 'dim_strength', width: 'dim_width', tension: 'dim_tension', rsa: 'dim_rsa' };

function tr(key, fallback) {
  const value = getText(key);
  return value && value !== key ? value : fallback;
}

function fmt(key, fallback, values) {
  let value = tr(key, fallback);
  (values || []).forEach(function (item) { value = value.replace('%s', String(item)); });
  return value.replace(/%%/g, '%');
}

function scoreLevel(score) {
  if (score >= 8) return tr('dim_level_harmonious', '和畅');
  if (score >= 6.5) return tr('dim_level_balanced', '平和');
  if (score >= 5) return tr('dim_level_slight', '略偏');
  if (score >= 3) return tr('dim_level_clear', '偏显');
  return tr('dim_level_adjust', '待调');
}

function stateKey(key, category) {
  const states = {
    rate: { chi: 'slow', huan: 'leisurely', zhong: 'moderate', pian_shuo: 'slightly_fast', shuo: 'fast' },
    rhythm: { stable: 'steady', mostly_stable: 'mostly_steady', moderate: 'moderate', variable: 'variable' },
    strength: { xu: 'weak', pian_xu: 'slightly_weak', ping: 'balanced', pian_shi: 'slightly_full', shi: 'full' },
    width: { xi: 'fine', pian_xi: 'slightly_fine', ping: 'even', pian_hong: 'slightly_flooding', hong: 'flooding' },
    tension: { ruan: 'soft', ru: 'yielding', ping: 'balanced', pian_xian: 'slightly_wiry', xian: 'wiry' },
    rsa: { slow: 'slow', settling: 'settling', balanced: 'balanced', relaxed: 'relaxed', improving: 'improving' }
  };
  return (states[key] && states[key][category]) || 'balanced';
}

function buildEvidence(key, diagnosis, metrics) {
  const ctx = diagnosis.context || {};
  const d = metrics.dynamics || ctx.dynamics || {};
  const q = metrics.signalQuality || diagnosis.quality || {};
  const out = [];
  if (key === 'rate' && d.medianHr > 0) out.push(fmt('dim_evidence_median_hr', '大部分时间心率在 %s 次/分左右', [d.medianHr]));
  if ((key === 'rate' || key === 'width') && d.p10Hr > 0 && d.p90Hr > 0) out.push(fmt('dim_evidence_hr_range', '心率主要处于 %s～%s 次/分', [d.p10Hr, d.p90Hr]));
  if (key === 'rhythm' && d.successiveMad != null) out.push(fmt('dim_evidence_successive', '相邻心率读数通常变化约 %s 次/分', [d.successiveMad]));
  if (key === 'rhythm' && q.jumpRatio != null) out.push(fmt('dim_evidence_jump', '较大的心率变化约占 %s%%', [Math.round(q.jumpRatio * 100)]));
  if (key === 'strength' && metrics.sleepScore > 0) out.push(fmt('dim_evidence_sleep', '昨晚睡眠恢复参考为 %s/10', [metrics.sleepScore]));
  if (key === 'strength' && metrics.hrReserve > 0) out.push(fmt('dim_evidence_day_range', '今天心率活动范围约为 %s 次/分', [Math.min(45, metrics.hrReserve)]));
  if (key === 'tension' && metrics.stress > 0) out.push(fmt('dim_evidence_stress', '今天压力参考值为 %s', [metrics.stress]));
  if (key === 'rsa' && d.firstLastDelta != null) out.push(fmt('dim_evidence_first_last', '后半段心率比前半段变化 %s 次/分', [d.firstLastDelta]));
  const quality = q.score == null ? (diagnosis.quality ? diagnosis.quality.score : null) : q.score;
  if (quality != null) out.push(tr(quality >= 80 ? 'dim_evidence_quality_good' : 'dim_evidence_quality_limited', quality >= 80 ? '这次采集到的数据较完整' : '这次采集到的信息较少，只作简单展示'));
  return out.slice(0, 3);
}

function buildFactors(key, metrics) {
  const out = [];
  if (key === 'rate' || key === 'tension') out.push(tr('dim_factor_activity_emotion', '刚活动过、事情较多或情绪起伏，都可能让心率变快'));
  if (key === 'rhythm' || key === 'width') out.push(tr('dim_factor_wearing', '表带松紧、手臂动作和说话都会影响心率读数'));
  if (metrics.sleepScore > 0 && metrics.sleepScore < 7) out.push(tr('dim_factor_sleep', '睡眠不足时，心率可能变快，恢复速度也会变慢'));
  if (key === 'strength' || key === 'rsa') out.push(tr('dim_factor_recovery', '睡眠和当天活动量会影响脉势与恢复速度'));
  return out.slice(0, 2);
}

function buildSuggestions(key, state) {
  const one = tr('dim_care_' + key + '_' + state + '_1', tr('dim_care_general_1', '今天照常安排活动即可'));
  const two = tr('dim_care_' + key + '_' + state + '_2', tr('dim_care_general_2', '坐久了起来走几分钟'));
  return [one, two].filter(Boolean);
}

export function buildDimensionInterpretation(key, diagnosis, metrics) {
  if (!diagnosis || !diagnosis.dimensions) return null;
  const dim = diagnosis.dimensions[key];
  if (!dim) return null;
  metrics = metrics || {};
  const state = stateKey(key, dim.category);
  const quality = (diagnosis.quality && diagnosis.quality.score == null) ? 72 : (diagnosis.quality ? diagnosis.quality.score : 72);
  return {
    key: key,
    name: getText(NAMES[key]),
    score: dim.score,
    level: dim.category === 'unknown' ? getText('dim_label_unknown') : scoreLevel(dim.score),
    label: dim.label,
    intro: tr('dim_intro_' + key, '这一项用来看看今天的心率节奏。'),
    summary: dim.category === 'unknown' ? getText('dim_label_unknown') : tr('dim_state_' + key + '_' + state, '今天这一项处在中间范围。'),
    relative: relativeLine(key, metrics),
    evidence: buildEvidence(key, diagnosis, metrics),
    factors: buildFactors(key, metrics),
    suggestions: buildSuggestions(key, state),
    reference: dim.category === 'unknown' || quality < 65
      ? tr('dim_reference_limited', '本次信息较少')
      : dim.confidence >= 0.75 ? tr('dim_reference_clear', '特点较清楚') : tr('dim_reference_gentle', '特点较温和'),
    quality: quality
  };
}
