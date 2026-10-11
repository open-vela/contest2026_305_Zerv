/**
 * 脉象诊断引擎 (Pulse Diagnosis Engine) — V2
 * 移植自 Zepp OS 版 utils/pulse_diagnosis.js（稳健统计 + 信号质量 + 六维连续评分
 * + 置信度修正 + 洪脉校准 + 个人基线双轨融合）。
 * openvela 适配：
 *  - getText 由 utils/strings.js 提供；
 *  - 不引入长时程基线（Vela 无全天心率/压力/睡眠数据源），相关校准走 wLT=0 安全回退；
 *  - 引擎无 Object.entries/values、可选链、对象展开 —— 全部改写为 ES5 形式。
 */
import { getText } from './strings';
import { getBaseline } from './baseline_manager';

// ============================================================================
// 脉象元数据（msgid → getText 延迟解析）
// ============================================================================
function resolvePulseTypes() {
  return {
    fu:   { name: getText('pulse_name_fu'),   desc: getText('pulse_desc_fu'),   nature: 'yang' },
    chen: { name: getText('pulse_name_chen'), desc: getText('pulse_desc_chen'), nature: 'yin' },
    chi:  { name: getText('pulse_name_chi'),  desc: getText('pulse_desc_chi'),  nature: 'yin' },
    shuo: { name: getText('pulse_name_shuo'), desc: getText('pulse_desc_shuo'), nature: 'yang' },
    hua:  { name: getText('pulse_name_hua'),  desc: getText('pulse_desc_hua'),  nature: 'yang' },
    se:   { name: getText('pulse_name_se'),   desc: getText('pulse_desc_se'),   nature: 'yin' },
    xu:   { name: getText('pulse_name_xu'),   desc: getText('pulse_desc_xu'),   nature: 'yin' },
    shi:  { name: getText('pulse_name_shi'),  desc: getText('pulse_desc_shi'),  nature: 'yang' },
    xian: { name: getText('pulse_name_xian'), desc: getText('pulse_desc_xian'), nature: 'yang' },
    xi:   { name: getText('pulse_name_xi'),   desc: getText('pulse_desc_xi'),   nature: 'yin' },
    hong: { name: getText('pulse_name_hong'), desc: getText('pulse_desc_hong'), nature: 'yang' },
    huan: { name: getText('pulse_name_huan'), desc: getText('pulse_desc_huan'), nature: 'neutral' },
    jie:  { name: getText('pulse_name_jie'),  desc: getText('pulse_desc_jie'),  nature: 'yin' },
    dai:  { name: getText('pulse_name_dai'),  desc: getText('pulse_desc_dai'),  nature: 'yin' },
  };
}

function resolveConstitutions() {
  return {
    balanced:        { name: getText('const_name_balanced'),        desc: getText('const_desc_balanced') },
    qi_deficiency:   { name: getText('const_name_qi_def'),          desc: getText('const_desc_qi_def') },
    yang_deficiency: { name: getText('const_name_yang_def'),        desc: getText('const_desc_yang_def') },
    yin_deficiency:  { name: getText('const_name_yin_def'),         desc: getText('const_desc_yin_def') },
    qi_stagnation:   { name: getText('const_name_qi_stag'),         desc: getText('const_desc_qi_stag') },
    blood_stasis:    { name: getText('const_name_blood_stasis'),    desc: getText('const_desc_blood_stasis') },
    phlegm_damp:     { name: getText('const_name_phlegm_damp'),     desc: getText('const_desc_phlegm_damp') },
    damp_heat:       { name: getText('const_name_damp_heat'),       desc: getText('const_desc_damp_heat') },
    allergic:        { name: getText('const_name_allergic'),        desc: getText('const_desc_allergic') },
  };
}

// ============================================================================
// 基础工具
// ============================================================================
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
function finite(v) { return typeof v === 'number' && isFinite(v); }
function bounded(v, min, max, fallback) { return finite(v) ? clamp(v, min, max) : fallback; }
function validHr(v) { return finite(v) && v >= 35 && v <= 220; }
function centeredScore(index, ideal, spread) {
  return round1(clamp(9 - Math.abs(index - ideal) / spread * 7, 2, 9));
}
function dimResult(value, stateIndex, category, label, score, confidence, evidenceCodes, missingMetrics) {
  return { value: value, stateIndex: round1(stateIndex), category: category, label: label, score: round1(score),
    confidence: round1(clamp(confidence == null ? 0.7 : confidence, 0, 1)),
    evidenceCodes: evidenceCodes || [], missingMetrics: missingMetrics || [] };
}

// 按 value 降序排列的键数组（替代 Object.entries().sort()，引擎无 entries）。
function rankKeys(scores) {
  const keys = Object.keys(scores);
  keys.sort((a, b) => scores[b] - scores[a]);
  return keys;
}

// 双轨融合 stateIndex：绝对指数与"相对个人常态"指数按 w 加权。
// 相对指数 = 50 + clamp(z,-3,3)×12，z=(本次值−基线中位)/基线MAD，映射回 0-100。
// w=0（无基线/样本不足）或该指标无基线时，原样返回绝对指数 → 行为与旧版一致。
function fuseStateIndex(absIndex, value, base, w, invert) {
  if (!finite(w) || w <= 0 || !base || !finite(base.med) || !finite(base.mad) || !(base.mad > 0)) return absIndex;
  if (typeof value !== 'number' || !isFinite(value)) return absIndex;
  const z = (value - base.med) / base.mad;
  const relIndex = 50 + (invert ? -1 : 1) * clamp(z, -3, 3) * 12;
  const weight = clamp(w, 0, 1);
  return clamp(absIndex * (1 - weight) + relIndex * weight, 0, 100);
}

// ============================================================================
// 六维分类器 v2：score 表示接近平和状态，stateIndex 表示偏向方向。
// ============================================================================
function classifyRate(hr, quality, baseline, w) {
  if (hr <= 0) return dimResult(0, 50, 'unknown', getText('dim_label_unknown'), 5, 0.2, [], ['medianHr']);
  const index = clamp((hr - 45) / 55 * 100, 0, 100);
  let category, label;
  if (hr < 52) { category = 'chi'; label = getText('dim_label_rate_chi'); }
  else if (hr < 60) { category = 'huan'; label = getText('dim_label_rate_huan'); }
  else if (hr < 78) { category = 'zhong'; label = getText('dim_label_rate_zhong'); }
  else if (hr < 90) { category = 'pian_shuo'; label = getText('dim_label_rate_pian_shuo'); }
  else { category = 'shuo'; label = getText('dim_label_rate_shuo'); }
  const fused = fuseStateIndex(index, hr, baseline && baseline.hr, w);
  const effHr = 45 + fused / 100 * 55;
  const score = effHr < 58 ? 9 - (58 - effHr) * 0.28 : 9 - Math.max(0, effHr - 78) * 0.20;
  return dimResult(hr, fused, category, label, clamp(score, 2, 9), quality, ['median_hr'], []);
}

function classifyRhythm(hrMad, successiveMad, jumpRatio, quality, baseline, w) {
  if (hrMad == null || successiveMad == null) return dimResult(0, 50, 'unknown', getText('dim_label_unknown'), 5, 0.2, [], ['hrMad']);
  const instability = clamp(hrMad / 6 * 0.45 + successiveMad / 5 * 0.35 + jumpRatio / 0.12 * 0.20, 0, 1);
  let category, label;
  if (instability < 0.22) { category = 'stable'; label = getText('dim_label_rhythm_stable'); }
  else if (instability < 0.40) { category = 'mostly_stable'; label = getText('dim_label_rhythm_mostly_stable'); }
  else if (instability < 0.60) { category = 'moderate'; label = getText('dim_label_rhythm_moderate'); }
  else { category = 'variable'; label = getText('dim_label_rhythm_variable'); }
  const fused = fuseStateIndex(instability * 100, hrMad, baseline && baseline.rhythm, w);
  return dimResult(instability, fused, category, label, clamp(9 - fused / 100 * 7, 2, 9), quality, ['hr_mad', 'successive_change', 'jump_ratio'], []);
}

function classifyStrength(dayRange, sleepScore, stress, firstLastDelta, quality, ltIndex, wLT) {
  const missing = [];
  if (!(dayRange > 0)) missing.push('dayRange');
  if (!(sleepScore > 0)) missing.push('sleepScore');
  if (!(stress > 0)) missing.push('stress');
  const vitality = (dayRange > 0 ? clamp(dayRange / 45, 0, 1) : 0.5) * 0.30 +
    (sleepScore > 0 ? clamp(sleepScore / 10, 0, 1) : 0.5) * 0.30 +
    (stress > 0 ? 1 - clamp(stress / 100, 0, 1) : 0.5) * 0.20 +
    clamp((4 - firstLastDelta) / 10, 0, 1) * 0.20;
  let category, label;
  if (vitality < 0.30) { category = 'xu'; label = getText('dim_label_strength_xu'); }
  else if (vitality < 0.44) { category = 'pian_xu'; label = getText('dim_label_strength_pian_xu'); }
  else if (vitality < 0.66) { category = 'ping'; label = getText('dim_label_ping'); }
  else if (vitality < 0.80) { category = 'pian_shi'; label = getText('dim_label_strength_pian_shi'); }
  else { category = 'shi'; label = getText('dim_label_strength_shi'); }
  let stateIdx = vitality * 100;
  if (wLT && ltIndex != null) stateIdx = clamp(stateIdx * (1 - wLT) + ltIndex * wLT, 0, 100);
  return dimResult(vitality, stateIdx, category, label, centeredScore(stateIdx, 55, 45), quality, ['day_range', 'sleep', 'stress'], missing);
}

function classifyWidth(hrRange90, hrMad, patternEntropy, quality) {
  if (hrRange90 == null || hrMad == null) return dimResult(0, 50, 'unknown', getText('dim_label_unknown'), 5, 0.2, [], ['hrRange90']);
  const width = clamp(hrRange90 / 14, 0, 1) * 0.55 + clamp(hrMad / 5, 0, 1) * 0.25 +
    (patternEntropy != null ? clamp(patternEntropy / 3, 0, 1) : 0.5) * 0.20;
  let category, label;
  if (width < 0.24) { category = 'xi'; label = getText('dim_label_width_xi'); }
  else if (width < 0.40) { category = 'pian_xi'; label = getText('dim_label_width_pian_xi'); }
  else if (width < 0.66) { category = 'ping'; label = getText('dim_label_ping'); }
  else if (width < 0.82) { category = 'pian_hong'; label = getText('dim_label_width_pian_hong'); }
  else { category = 'hong'; label = getText('dim_label_width_hong'); }
  return dimResult(width, width * 100, category, label, centeredScore(width * 100, 55, 50), quality, ['hr_range', 'hr_mad', 'pattern_entropy'], []);
}

function classifyTension(stress, hr, restingHr, successiveMad, trendSlope, sleepScore, quality, baseline, w) {
  const missing = stress > 0 ? [] : ['stress'];
  const restBase = restingHr > 0 ? restingHr : hr;
  const tension = (stress > 0 ? clamp(stress / 100, 0, 1) : 0.5) * 0.45 +
    clamp((hr - restBase + 5) / 25, 0, 1) * 0.20 + clamp(successiveMad / 5, 0, 1) * 0.15 +
    clamp((trendSlope + 2) / 8, 0, 1) * 0.10 + (sleepScore > 0 ? 1 - sleepScore / 10 : 0.5) * 0.10;
  let category, label;
  if (tension < 0.25) { category = 'ruan'; label = getText('dim_label_tension_ruan'); }
  else if (tension < 0.42) { category = 'ru'; label = getText('dim_label_tension_ru'); }
  else if (tension < 0.60) { category = 'ping'; label = getText('dim_label_ping'); }
  else if (tension < 0.76) { category = 'pian_xian'; label = getText('dim_label_tension_pian_xian'); }
  else { category = 'xian'; label = getText('dim_label_tension_xian'); }
  const stateIdx = fuseStateIndex(tension * 100, stress > 0 ? stress : null, baseline && baseline.stress, w);
  return dimResult(tension, stateIdx, category, label, centeredScore(stateIdx, 48, 52), quality, ['stress', 'hr_elevation', 'trend'], missing);
}

// 恢复表现：关注测量过程中是否逐渐趋稳，不对自主神经功能作强结论。
function classifyRsa(firstLastDelta, hrMad, stress, sleepScore, quality, legacyEiRatio, baseline, w) {
  if (firstLastDelta == null && !(legacyEiRatio > 0)) {
    return dimResult(0, 50, 'unknown', getText('dim_label_unknown'), 5, 0.2, [], ['firstLastDelta']);
  }
  const deltaPart = firstLastDelta == null ? 0.5 : clamp((-firstLastDelta + 3) / 10, 0, 1);
  const stabilityPart = hrMad == null ? 0.5 : 1 - clamp(hrMad / 6, 0, 1);
  const stressPart = stress > 0 ? 1 - clamp(stress / 100, 0, 1) : 0.5;
  const sleepPart = sleepScore > 0 ? clamp(sleepScore / 10, 0, 1) : 0.5;
  let recovery = deltaPart * 0.40 + stabilityPart * 0.30 + stressPart * 0.15 + sleepPart * 0.15;
  if (firstLastDelta == null && legacyEiRatio > 0) recovery = clamp((legacyEiRatio - 1.0) / 0.15, 0, 1);
  let category, label;
  if (recovery < 0.28) { category = 'slow'; label = getText('dim_label_rsa_slow'); }
  else if (recovery < 0.46) { category = 'settling'; label = getText('dim_label_rsa_settling'); }
  else if (recovery < 0.68) { category = 'balanced'; label = getText('dim_label_rsa_balanced'); }
  else if (recovery < 0.84) { category = 'relaxed'; label = getText('dim_label_rsa_relaxed'); }
  else { category = 'improving'; label = getText('dim_label_rsa_improving'); }
  const stateIdx = fuseStateIndex(recovery * 100, firstLastDelta, baseline && baseline.delta, w, true);
  return dimResult(recovery, stateIdx, category, label, centeredScore(stateIdx, 68, 68), quality,
    ['first_last_delta', 'late_stability', 'stress'], stress > 0 ? [] : ['stress']);
}

// ============================================================================
// 五脏 & 体质 (msgid)
// ============================================================================
// 由内部 key（organKey/statusKey）映射到五脏描述 msgid，与语言无关
function organDescKey(organKey, statusKey) {
  const map = {
    heart:  { he: 'organ_desc_heart_he',  ping: 'organ_desc_heart_ping',  xu: 'organ_desc_heart_xu',  kui: 'organ_desc_heart_kui' },
    liver:  { he: 'organ_desc_liver_he',  ping: 'organ_desc_liver_ping',  xu: 'organ_desc_liver_xu',  kui: 'organ_desc_liver_kui' },
    spleen: { he: 'organ_desc_spleen_he', ping: 'organ_desc_spleen_ping', xu: 'organ_desc_spleen_xu', kui: 'organ_desc_spleen_kui' },
    lung:   { he: 'organ_desc_lung_he',   ping: 'organ_desc_lung_ping',   xu: 'organ_desc_lung_xu',   kui: 'organ_desc_lung_kui' },
    kidney: { he: 'organ_desc_kidney_he', ping: 'organ_desc_kidney_ping', xu: 'organ_desc_kidney_xu', kui: 'organ_desc_kidney_kui' },
  };
  return (map[organKey] && map[organKey][statusKey]) || '';
}

// ============================================================================
// 主脉象匹配 v2：使用绝对匹配度，不再把第一名强制归一化为 1。
// 1Hz 心率能够稳定支持的特征优先，浮/沉/结/代保留在知识库中。
// ============================================================================
function matchPulseType(dimensions, metrics) {
  const hr = metrics.medianHr || metrics.mean_hr || metrics.restingHr || 0;
  const stress = metrics.stress || 0;
  const range = metrics.hrRange90 || 0;
  const hrMad = metrics.hrMad || 0;
  const successiveMad = metrics.successiveMad || 0;
  const jumpRatio = metrics.jumpRatio || 0;
  const quality = metrics.qualityScore == null ? 0.7 : metrics.qualityScore / 100;
  const smooth = 1 - clamp(jumpRatio / 0.15, 0, 1);
  const strengthIndex = (dimensions.strength.stateIndex == null ? 50 : dimensions.strength.stateIndex) / 100;
  const widthIndex = (dimensions.width.stateIndex == null ? 50 : dimensions.width.stateIndex) / 100;
  const tensionIndex = (dimensions.tension.stateIndex == null ? 50 : dimensions.tension.stateIndex) / 100;
  const rhythmBalance = dimensions.rhythm.score / 9;
  const scores = {};

  scores.chi = clamp((58 - hr) / 18, 0, 1) * 0.80 + (hr < 58 ? 0.12 : 0.02);
  scores.shuo = clamp((hr - 76) / 24, 0, 1) * 0.80 + (hr > 76 ? 0.12 : 0.02);
  scores.huan = clamp(1 - Math.abs(hr - 68) / 26, 0, 1) * 0.38 + rhythmBalance * 0.34 +
    (1 - Math.abs(tensionIndex - 0.48)) * 0.18 + smooth * 0.10;
  scores.xian = tensionIndex * 0.55 + clamp((stress - 35) / 65, 0, 1) * 0.25 +
    clamp((hr - 65) / 30, 0, 1) * 0.20;
  scores.hua = smooth * 0.35 + clamp(range / 12, 0, 1) * 0.25 +
    clamp((metrics.patternEntropy || 0) / 3, 0, 1) * 0.20 + rhythmBalance * 0.20;
  scores.se = (1 - smooth) * 0.42 + clamp(successiveMad / 5, 0, 1) * 0.28 +
    tensionIndex * 0.20 + (1 - quality) * 0.10;
  scores.xu = (1 - strengthIndex) * 0.62 + (1 - dimensions.rate.score / 9) * 0.18 +
    (1 - quality) * 0.20;
  scores.shi = strengthIndex * 0.62 + dimensions.rate.score / 9 * 0.18 + quality * 0.20;
  scores.xi = (1 - widthIndex) * 0.62 + (1 - strengthIndex) * 0.23 + smooth * 0.15;

  // 洪脉保留为较常见的充盛型倾向，但不再由全天极值单独触发。
  scores.hong = clamp(range / 14, 0, 1) * 0.35 + strengthIndex * 0.30 + smooth * 0.20 +
    clamp((metrics.dayRange || 0) / 45, 0, 1) * 0.15;
  if (range < 5 || strengthIndex < 0.45) scores.hong *= 0.72;

  // 低质量数据不产生极端文化映射，优先回落到缓脉或混合特征。
  if (quality < 0.65) {
    ['hua', 'se', 'xu', 'shi', 'xi', 'hong'].forEach(function (k) { scores[k] *= 0.72; });
    scores.huan *= 0.90;
  }

  // 排序保留计算精度，避免一位小数把不同匹配度变成同分。
  Object.keys(scores).forEach(function (k) { scores[k] = clamp(scores[k], 0, 1); });
  const ranked = rankKeys(scores);
  const bestType = ranked[0] || 'huan';
  const bestScore = scores[bestType] || 0;
  const secondType = ranked[1] || null;
  const secondScore = secondType ? scores[secondType] : 0;
  const margin = Math.max(0, bestScore - secondScore);
  const confidence = clamp(bestScore * 0.55 + clamp(margin / 0.25, 0, 1) * 0.25 + quality * 0.20, 0, 1);
  const certainty = confidence >= 0.75 ? 'primary' : confidence >= 0.60 ? 'close' : confidence >= 0.45 ? 'mixed' : 'unclear';

  const PULSE_TYPES = resolvePulseTypes();
  const info = PULSE_TYPES[bestType];
  const secondInfo = secondType ? PULSE_TYPES[secondType] : null;
  return {
    type: bestType, name: info.name, description: info.desc, nature: info.nature,
    confidence: round1(confidence), certainty: certainty,
    secondary: secondInfo ? { type: secondType, name: secondInfo.name, score: secondScore } : null,
    margin: round1(margin), allScores: scores
  };
}

// ============================================================================
// 体质判定（中医九种体质）
// ============================================================================
function assessConstitution(dimensions, mainPulse, metrics, baseline, w) {
  const stress = metrics.stress || 0;
  const hr = metrics.medianHr || metrics.restingHr || 0;
  const scores = {};
  const strengthLow = clamp((45 - dimensions.strength.stateIndex) / 45, 0, 1);
  const tensionHigh = clamp((dimensions.tension.stateIndex - 48) / 52, 0, 1);
  const widthHigh = clamp((dimensions.width.stateIndex - 55) / 45, 0, 1);
  const rhythmVariable = clamp(dimensions.rhythm.stateIndex / 100, 0, 1);
  const balanceAvg = (dimensions.rate.score + dimensions.rhythm.score + dimensions.strength.score + dimensions.width.score + dimensions.tension.score + dimensions.rsa.score) / 54;

  // 相对个人常态的心率 z：无基线/冷启动时 null → 下面三个绝对阈值项与旧版完全一致。
  const zHr = (w && baseline && baseline.hr && finite(baseline.hr.med) && finite(baseline.hr.mad) && baseline.hr.mad > 0)
    ? (hr - baseline.hr.med) / baseline.hr.mad : null;
  // 绝对阈值虽触发，但若"只是他自己的常态"，按基线成熟度 w 向 floor 回拉、弱化病理性判定（保留绝对锚）。
  function softenAbs(term, full, floor, support) {
    if (zHr == null || term <= floor) return term;
    return full - (full - floor) * clamp(w * clamp(1 - support, 0, 1), 0, 1);
  }
  const slowSupport = zHr == null ? 0 : clamp(-zHr, 0, 1);
  const fastSupport = zHr == null ? 0 : clamp(zHr, 0, 1);

  scores.balanced = clamp(balanceAvg, 0, 1) * 0.85;
  scores.qi_deficiency = strengthLow * 0.60 + (1 - dimensions.rsa.score / 9) * 0.40;
  scores.yang_deficiency = softenAbs(hr > 0 && hr < 58 ? 0.65 : 0.18, 0.65, 0.18, slowSupport) * 0.45 + strengthLow * 0.55;
  scores.yin_deficiency = softenAbs(hr > 78 ? 0.65 : 0.18, 0.65, 0.18, fastSupport) * 0.45 + clamp(stress / 100, 0, 1) * 0.55;
  scores.qi_stagnation = clamp(stress / 85, 0, 1) * 0.55 + tensionHigh * 0.45;
  scores.blood_stasis = rhythmVariable * 0.35 + tensionHigh * 0.35 + (mainPulse.type === 'se' ? 0.30 : 0.08);
  scores.phlegm_damp = strengthLow * 0.45 + widthHigh * 0.35 + (metrics.sleepScore > 0 && metrics.sleepScore < 6 ? 0.20 : 0.06);
  scores.damp_heat = softenAbs(hr > 74 ? 0.45 : 0.15, 0.45, 0.15, fastSupport) * 0.35 + clamp(stress / 90, 0, 1) * 0.40 + clamp((dimensions.strength.stateIndex - 55) / 45, 0, 1) * 0.25;
  scores.allergic = 0.12 + rhythmVariable * 0.18;

  const ranked = rankKeys(scores);
  const bestType = ranked[0] || 'balanced';
  const bestScore = scores[bestType] || 0;
  const secondType = ranked[1] || null;
  const secondScore = secondType ? scores[secondType] : 0;
  const CONSTITUTIONS = resolveConstitutions();
  const cnst = CONSTITUTIONS[bestType];
  return {
    type: bestType, name: cnst.name, description: cnst.desc,
    score: round1(clamp(bestScore, 0, 1)), margin: round1(Math.max(0, bestScore - secondScore)),
    confidence: round1(clamp((metrics.qualityScore == null ? 72 : metrics.qualityScore) / 100 * 0.5 + Math.max(0, bestScore - secondScore) * 2 * 0.5, 0, 1)),
    allScores: scores
  };
}

// ============================================================================
// 五脏关联
// ============================================================================
function analyzeOrgans(dimensions, mainPulse, metrics) {
  const stress = metrics.stress || 0;
  const sleepScore = metrics.sleepScore || 0;
  const quality = clamp((metrics.qualityScore == null ? 72 : metrics.qualityScore) / 100, 0, 1);
  const heartScore = dimensions.rhythm.score * 0.45 + dimensions.rate.score * 0.30 + (sleepScore || 6) * 0.15 + quality * 10 * 0.10;
  const liverScore = dimensions.tension.score * 0.55 + (stress > 0 ? (100 - stress) / 10 : 6) * 0.30 + dimensions.rsa.score * 0.15;
  const spleenScore = dimensions.width.score * 0.35 + dimensions.strength.score * 0.45 + (sleepScore || 6) * 0.20;
  const lungScore = dimensions.strength.score * 0.40 + dimensions.rhythm.score * 0.40 + dimensions.rsa.score * 0.20;
  const kidneyScore = dimensions.strength.score * 0.50 + dimensions.rsa.score * 0.30 + (sleepScore || 6) * 0.20;

  const organs = [
    { organ: getText('organ_name_heart'), organKey: 'heart', score: round1(clamp(heartScore, 0, 10)) },
    { organ: getText('organ_name_liver'), organKey: 'liver', score: round1(clamp(liverScore, 0, 10)) },
    { organ: getText('organ_name_spleen'), organKey: 'spleen', score: round1(clamp(spleenScore, 0, 10)) },
    { organ: getText('organ_name_lung'), organKey: 'lung', score: round1(clamp(lungScore, 0, 10)) },
    { organ: getText('organ_name_kidney'), organKey: 'kidney', score: round1(clamp(kidneyScore, 0, 10)) },
  ];

  organs.forEach(function (o) {
    if (o.score >= 7) { o.statusKey = 'he'; o.status = getText('organ_status_he'); }
    else if (o.score >= 5) { o.statusKey = 'ping'; o.status = getText('organ_status_ping'); }
    else if (o.score >= 3) { o.statusKey = 'xu'; o.status = getText('organ_status_xu'); }
    else { o.statusKey = 'kui'; o.status = getText('organ_status_kui'); }
    o.desc = getText(organDescKey(o.organKey, o.statusKey));
    o.confidence = round1(quality);
  });
  return organs;
}

// ============================================================================
// 养生建议
// 根据体质类型、最虚弱脏器、六维细分级三维联动生成个性化建议。
// ============================================================================
function generateRecommendations(dimensions, constitution, organAnalysis, metrics) {
  const recs = [];
  const separator = getText('rec_separator');
  const isFast = dimensions.rate.category === 'pian_shuo' || dimensions.rate.category === 'shuo';
  const isTense = dimensions.tension.category === 'pian_xian' || dimensions.tension.category === 'xian';
  const isWeak = dimensions.strength.category === 'xu' || dimensions.strength.category === 'pian_xu';
  const isFull = dimensions.width.category === 'pian_hong' || dimensions.width.category === 'hong';
  const slowRecovery = dimensions.rsa.category === 'slow' || dimensions.rsa.category === 'settling';
  const ct = constitution.type;

  // ── 饮食：体质专属 → 六维补充 ──
  const diet = [];
  const dietByConstitution = {
    qi_deficiency:   'rec_diet_qi_def',
    yang_deficiency: 'rec_diet_yang_def',
    yin_deficiency:  'rec_diet_yin_def',
    qi_stagnation:   'rec_diet_qi_stag',
    phlegm_damp:     'rec_diet_phlegm_damp',
    damp_heat:       'rec_diet_damp_heat',
    blood_stasis:    'rec_diet_blood_stasis',
    allergic:        'rec_diet_allergic',
  };
  const dietKey = dietByConstitution[ct];
  if (dietKey) {
    diet.push(getText(dietKey));
  } else {
    diet.push(getText('rec_diet_default'));
  }
  if (isFast && isTense) diet.push(getText('rec_diet_calm'));
  recs.push({ category: getText('rec_cat_diet'), advice: diet.join(separator), priority: isFast || isTense ? 1 : 3 });

  // ── 作息：最虚弱脏器 → 张力/恢复补充 ──
  const rest = [];
  const sortedOrgans = organAnalysis.slice().sort((a, b) => a.score - b.score);
  const worstOrgan = sortedOrgans[0];
  if (worstOrgan && worstOrgan.organKey === 'liver' && worstOrgan.score < 5) {
    rest.push(getText('rec_rest_liver'));
  } else if (worstOrgan && worstOrgan.organKey === 'heart' && worstOrgan.score < 5) {
    rest.push(getText('rec_rest_heart'));
  } else if (isWeak || slowRecovery) {
    rest.push(getText('rec_rest_recovery'));
  } else if (isTense || isFast) {
    rest.push(getText('rec_rest_calm'));
  } else {
    rest.push(getText('rec_rest_default'));
  }
  if (isTense || isFast) rest.push(getText('rec_rest_no_caffeine'));
  recs.push({ category: getText('rec_cat_rest'), advice: rest.join(separator), priority: isWeak || slowRecovery ? 1 : 2 });

  // ── 运动：力量维/宽度维/恢复维细分级 ──
  const exercise = [];
  if (isWeak || slowRecovery) {
    exercise.push(getText('rec_exercise_gentle'));
  } else if (isFull) {
    exercise.push(getText('rec_exercise_cardio'));
  } else if (isTense) {
    exercise.push(getText('rec_exercise_relax'));
  } else {
    exercise.push(getText('rec_exercise_default'));
  }
  recs.push({ category: getText('rec_cat_exercise'), advice: exercise.join(separator), priority: 2 });

  // ── 情志：体质类型 + 张力维联动 ──
  const mind = [];
  if (ct === 'qi_stagnation') {
    mind.push(getText('rec_mind_social'));
    if (isTense) mind.push(getText('rec_mind_no_anger'));
  } else if (isTense) {
    mind.push(getText('rec_mind_meditate'));
    mind.push(getText('rec_mind_no_anger'));
  } else if (slowRecovery) {
    mind.push(getText('rec_mind_unwind'));
  } else {
    mind.push(getText('rec_mind_default'));
  }
  recs.push({ category: getText('rec_cat_mind'), advice: mind.join(separator), priority: isTense ? 1 : 3 });

  return recs;
}

// ============================================================================
// 趋势分析（保留 Vela 现有实现，供其它页面引用）
// ============================================================================
export function analyzeTrend(currentSdnn, currentSdann, historyRecords) {
  if (!historyRecords || historyRecords.length < 3) {
    return { trend: 'insufficient_data', label: getText('trend_insufficient'), direction: 'stable', changeRate: 0 };
  }
  const recent = historyRecords.slice(-7);
  const sdnnValues = recent.map(r => (r.metrics && r.metrics.sdnn) || r.sdnn || 0).filter(v => v > 0);
  if (sdnnValues.length < 3) return { trend: 'insufficient_data', label: getText('trend_insufficient'), direction: 'stable', changeRate: 0 };

  const avgSdnn = sdnnValues.reduce((a, b) => a + b, 0) / sdnnValues.length;
  const changeRate = avgSdnn > 0 ? (currentSdnn - avgSdnn) / avgSdnn : 0;

  let direction = 'stable', labelKey = 'trend_stable';
  if (changeRate > 0.15)      { direction = 'improving'; labelKey = 'trend_improving'; }
  else if (changeRate > 0.05) { direction = 'slightly_improving'; labelKey = 'trend_slightly_improving'; }
  else if (changeRate < -0.15) { direction = 'declining'; labelKey = 'trend_declining'; }
  else if (changeRate < -0.05) { direction = 'slightly_declining'; labelKey = 'trend_slightly_declining'; }
  return { trend: direction, label: getText(labelKey), direction, changeRate: Math.round(changeRate * 100) / 100 };
}

// ============================================================================
// 主入口：兼容旧版指标，并优先使用 v2 心率动态与质量字段。
// ============================================================================
export function diagnosePulse(metrics, baseline) {
  metrics = metrics || {};
  const dynamics = metrics.dynamics || {};
  const signalQuality = metrics.signalQuality || {};
  const medianHr = [dynamics.medianHr, metrics.mean_hr, metrics.avgHr, metrics.restingHr].filter(validHr)[0];
  // 没有有效心率时交给页面已有的空态；不把缺失值解释成迟脉/平和。
  if (medianHr == null) return null;
  // 未显式传入基线时回退到会话缓存（由 baseline_manager.refreshBaseline 预热）。
  // 无基线 → w=0 → 六维行为与旧版完全一致（冷启动/未刷新安全）。
  if (baseline === undefined) baseline = getBaseline();
  const _sampleCount = bounded(baseline && baseline.sampleCount, 0, 10000, 0);
  const _fusionW = Math.min(0.6, _sampleCount / 14 * 0.6);
  // Vela 无全天心率/压力/睡眠数据源，长时程基线恒缺 → wLT=0 → strength 与旧版一致。
  const _ltIndex = null, _wLT = 0;
  const longterm = null;

  const legacyStability = bounded(metrics.hrStability, 0, 220, null);
  const hrMad = bounded(dynamics.hrMad, 0, 220, legacyStability == null ? null : legacyStability * 0.67);
  const successiveMad = bounded(dynamics.successiveMad, 0, 220, hrMad == null ? null : hrMad * 0.55);
  const hrRange90 = bounded(dynamics.hrRange90, 0, 220, legacyStability == null ? null : Math.min(18, legacyStability * 2.6));
  const trendSlope = bounded(dynamics.trendSlope, -220, 220, 0);
  const firstLastDelta = bounded(dynamics.firstLastDelta, -220, 220, null);
  const patternEntropy = bounded(dynamics.patternEntropy, 0, Math.log2(27), bounded(metrics.patternEntropy, 0, Math.log2(27), null));
  const jumpRatio = bounded(signalQuality.jumpRatio, 0, 1, 0);
  const qualityScore = bounded(signalQuality.score, 0, 100, 72);
  const quality = clamp(qualityScore / 100, 0.2, 1);
  const dayRange = bounded(metrics.dayRange, 0, 45, bounded(metrics.hrReserve, 0, 45, 0));
  const stress = bounded(metrics.stress, 0, 100, 0);
  const sleepScore = bounded(metrics.sleepScore, 0, 10, 0);
  const restingHr = validHr(metrics.restingHr) ? metrics.restingHr : 0;

  const derivedMetrics = Object.assign({}, metrics, {
    medianHr: medianHr, hrMad: hrMad, successiveMad: successiveMad, hrRange90: hrRange90, trendSlope: trendSlope,
    firstLastDelta: firstLastDelta, patternEntropy: patternEntropy, jumpRatio: jumpRatio, qualityScore: qualityScore,
    dayRange: dayRange, stress: stress, sleepScore: sleepScore, restingHr: restingHr,
  });

  const dimensions = {
    rate: classifyRate(medianHr, quality, baseline, _fusionW),
    rhythm: classifyRhythm(hrMad, successiveMad, jumpRatio, quality, baseline, _fusionW),
    strength: classifyStrength(dayRange, sleepScore, stress, firstLastDelta || 0, quality, _ltIndex, _wLT),
    width: classifyWidth(hrRange90, hrMad, patternEntropy, quality),
    tension: classifyTension(stress, medianHr, restingHr, successiveMad, trendSlope, sleepScore, quality, baseline, _fusionW),
    rsa: classifyRsa(firstLastDelta, hrMad, stress, sleepScore, quality, bounded(metrics.rsaEiRatio, 0, 3, 0), baseline, _fusionW)
  };

  let segmentTrend = 'stable';
  if (firstLastDelta != null) {
    if (firstLastDelta <= -2) segmentTrend = 'relaxing';
    else if (firstLastDelta >= 2) segmentTrend = 'tiring';
  } else if (Array.isArray(metrics.sdnnSegments) && metrics.sdnnSegments.length >= 3) {
    const segments = metrics.sdnnSegments.filter(function (v) { return finite(v) && v >= 0; });
    const split = Math.ceil(segments.length / 2);
    const first = segments.slice(0, split);
    const second = segments.slice(split);
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / Math.max(1, second.length);
    if (avgFirst > 0 && avgSecond / avgFirst > 1.1) segmentTrend = 'relaxing';
    else if (avgFirst > 0 && avgSecond / avgFirst < 0.9) segmentTrend = 'tiring';
  }

  const mainPulse = matchPulseType(dimensions, derivedMetrics);
  const constitution = assessConstitution(dimensions, mainPulse, derivedMetrics, baseline, _fusionW);
  const organAnalysis = analyzeOrgans(dimensions, mainPulse, derivedMetrics);
  const recommendations = generateRecommendations(dimensions, constitution, organAnalysis, derivedMetrics);

  const contextDynamics = Object.assign({}, dynamics, {
    medianHr: medianHr, hrMad: hrMad, successiveMad: successiveMad, hrRange90: hrRange90,
    trendSlope: trendSlope, firstLastDelta: firstLastDelta, patternEntropy: patternEntropy,
  });
  const missingMetrics = Object.keys(dimensions).reduce(function (all, key) { return all.concat(dimensions[key].missingMetrics); }, [])
    .filter(function (v, i, a) { return a.indexOf(v) === i; });

  return {
    algorithmVersion: metrics.dynamics ? 2 : 1,
    mainPulse: mainPulse, dimensions: dimensions, constitution: constitution, organAnalysis: organAnalysis,
    recommendations: recommendations, segmentTrend: segmentTrend, longterm: longterm,
    quality: { score: qualityScore, level: qualityScore >= 80 ? 'good' : qualityScore >= 65 ? 'fair' : 'poor' },
    context: { dynamics: contextDynamics, missingMetrics: missingMetrics },
    timestamp: Date.now()
  };
}
