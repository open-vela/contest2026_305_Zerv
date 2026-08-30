/**
 * 脉象诊断引擎 (Pulse Diagnosis Engine)
 * 所有文案经 getText() 解析，msgid 以 pulse_/const_/organ_/dim_/rec_/trend_ 为前缀。
 * openvela 版：getText 由 utils/strings.js 提供（本地文案字典），算法与 Zepp OS 版一致。
 */
import { getText } from './strings';

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
// 分类器 — label 通过 getText 获取
// ============================================================================
function classifyRate(restingHr) {
  if (restingHr <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  if (restingHr < 52) return { value: restingHr, category: 'chi',   label: getText('dim_label_rate_chi'),   score: 2 };
  if (restingHr < 62) return { value: restingHr, category: 'huan',  label: getText('dim_label_rate_huan'),  score: 7 };
  if (restingHr < 78) return { value: restingHr, category: 'zhong', label: getText('dim_label_rate_zhong'), score: 8 };
  if (restingHr < 90) return { value: restingHr, category: 'pian_shuo', label: getText('dim_label_rate_pian_shuo'), score: 5 };
  return { value: restingHr, category: 'shuo', label: getText('dim_label_rate_shuo'), score: 3 };
}

function classifyRhythm(sdnn) {
  if (sdnn <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  if (sdnn < 18) return { value: sdnn, category: 'jie_dai',   label: getText('dim_label_rhythm_jie_dai'),   score: 2 };
  if (sdnn < 30) return { value: sdnn, category: 'pian_buqi', label: getText('dim_label_rhythm_pian_buqi'), score: 4 };
  if (sdnn < 50) return { value: sdnn, category: 'ke',        label: getText('dim_label_rhythm_ke'),        score: 6 };
  if (sdnn < 75) return { value: sdnn, category: 'qi',        label: getText('dim_label_rhythm_qi'),        score: 8 };
  return { value: sdnn, category: 'he', label: getText('dim_label_rhythm_he'), score: 9 };
}

function classifyStrength(sdann, hrReserve) {
  if (sdann <= 0 && hrReserve <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  const score = (sdann > 0 ? Math.min(1, sdann / 80) : 0.5) * 0.6 + (hrReserve > 0 ? Math.min(1, hrReserve / 60) : 0.5) * 0.4;
  if (score < 0.2)  return { value: score, category: 'xu',       label: getText('dim_label_strength_xu'),       score: 2 };
  if (score < 0.35) return { value: score, category: 'pian_xu',  label: getText('dim_label_strength_pian_xu'),  score: 4 };
  if (score < 0.55) return { value: score, category: 'ping',     label: getText('dim_label_ping'),              score: 6 };
  if (score < 0.75) return { value: score, category: 'pian_shi', label: getText('dim_label_strength_pian_shi'), score: 7 };
  return { value: score, category: 'shi', label: getText('dim_label_strength_shi'), score: 9 };
}

function classifyWidth(hrStability, stress) {
  if (hrStability <= 0 && stress <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  const s = (stress > 0 ? 1 - Math.min(1, stress / 100) : 0.5) * 0.5 + (hrStability > 0 ? Math.min(1, hrStability / 15) : 0.5) * 0.5;
  if (s < 0.25) return { value: s, category: 'xi',        label: getText('dim_label_width_xi'),        score: 3 };
  if (s < 0.4)  return { value: s, category: 'pian_xi',   label: getText('dim_label_width_pian_xi'),   score: 4 };
  if (s < 0.6)  return { value: s, category: 'ping',      label: getText('dim_label_ping'),             score: 7 };
  if (s < 0.8)  return { value: s, category: 'pian_hong', label: getText('dim_label_width_pian_hong'), score: 8 };
  return { value: s, category: 'hong', label: getText('dim_label_width_hong'), score: 9 };
}

function classifyTension(stress, sdnn) {
  if (stress <= 0 && sdnn <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  const t = (stress > 0 ? Math.min(1, stress / 100) : 0.5) * 0.6 + (sdnn > 0 ? 1 - Math.min(1, sdnn / 100) : 0.5) * 0.4;
  if (t < 0.2)  return { value: t, category: 'ruan',       label: getText('dim_label_tension_ruan'),       score: 3 };
  if (t < 0.35) return { value: t, category: 'ru',         label: getText('dim_label_tension_ru'),         score: 5 };
  if (t < 0.5)  return { value: t, category: 'ping',       label: getText('dim_label_ping'),               score: 7 };
  if (t < 0.7)  return { value: t, category: 'pian_xian',  label: getText('dim_label_tension_pian_xian'),  score: 4 };
  return { value: t, category: 'xian', label: getText('dim_label_tension_xian'), score: 2 };
}

// ============================================================================
// 五脏 & 体质 (msgid)
// ============================================================================
function organDescKey(organ, status) {
  const map = {
    '心': { '和': 'organ_desc_heart_he', '平': 'organ_desc_heart_ping', '虚': 'organ_desc_heart_xu', '亏': 'organ_desc_heart_kui' },
    '肝': { '和': 'organ_desc_liver_he', '平': 'organ_desc_liver_ping', '虚': 'organ_desc_liver_xu', '亏': 'organ_desc_liver_kui' },
    '脾': { '和': 'organ_desc_spleen_he', '平': 'organ_desc_spleen_ping', '虚': 'organ_desc_spleen_xu', '亏': 'organ_desc_spleen_kui' },
    '肺': { '和': 'organ_desc_lung_he', '平': 'organ_desc_lung_ping', '虚': 'organ_desc_lung_xu', '亏': 'organ_desc_lung_kui' },
    '肾': { '和': 'organ_desc_kidney_he', '平': 'organ_desc_kidney_ping', '虚': 'organ_desc_kidney_xu', '亏': 'organ_desc_kidney_kui' },
  };
  return (map[organ] && map[organ][status]) || '';
}

// ============================================================================
// 主脉象匹配
// ============================================================================
function matchPulseType(dimensions, metrics) {
  const { restingHr, sdnn, sdann, stress, hrStability, hrReserve } = metrics;
  const scores = {};
  scores.fu   = (stress > 50 ? 0.7 : stress / 70) * 0.5 + (restingHr > 70 ? 0.6 : 0.3) * 0.3 + 0.2;
  scores.chen = (stress < 30 ? 0.8 : (100 - stress) / 125) * 0.4 + (restingHr < 60 ? 0.7 : 0.3) * 0.3 + (sdann < 40 ? 0.7 : 0.3) * 0.3;
  scores.chi  = restingHr < 55 ? (55 - restingHr) / 20 + 0.3 : 0.2;
  scores.shuo = restingHr > 85 ? (restingHr - 85) / 20 + 0.3 : 0.2;
  scores.hua  = Math.min(1, sdnn / 100) * 0.5 + Math.min(1, sdann / 80) * 0.5;
  scores.se   = (1 - Math.min(1, sdnn / 60)) * 0.6 + Math.min(1, stress / 100) * 0.4;
  scores.xu   = (1 - Math.min(1, sdnn / 80)) * 0.4 + (1 - Math.min(1, sdann / 70)) * 0.3 + (1 - Math.min(1, hrReserve / 50)) * 0.3;
  scores.shi  = Math.min(1, sdnn / 80) * 0.4 + Math.min(1, sdann / 70) * 0.3 + Math.min(1, hrReserve / 50) * 0.3;
  scores.xian = Math.min(1, stress / 100) * 0.5 + (1 - Math.min(1, sdnn / 80)) * 0.3 + (restingHr > 60 ? 0.4 : 0.1) * 0.2;
  scores.xi   = (1 - Math.min(1, sdnn / 60)) * 0.4 + (restingHr < 65 ? 0.5 : 0.2) * 0.3 + (1 - Math.min(1, sdann / 60)) * 0.3;
  scores.hong = Math.min(1, sdann / 80) * 0.5 + Math.min(1, hrReserve / 70) * 0.5;
  scores.huan = (restingHr >= 55 && restingHr <= 75 ? 0.8 : 0.2) * 0.35 + (sdnn >= 35 && sdnn <= 70 ? 0.8 : 0.2) * 0.35 + (stress < 50 ? 0.6 : 0.2) * 0.3;
  scores.jie  = sdnn < 20 ? (20 - sdnn) / 20 + 0.2 : 0.1;
  scores.dai  = sdnn < 22 ? (22 - sdnn) / 22 + 0.15 : 0.1;

  // RSA 维度修正：刚性=弦/涩脉加分，灵活=滑/平脉加分
  if (dimensions.rsa && dimensions.rsa.category !== 'unknown') {
    const rsaScore = dimensions.rsa.score / 9;
    if (dimensions.rsa.category === 'rigid' || dimensions.rsa.category === 'blunted') {
      scores.xian += rsaScore * 0.15;
      scores.se   += rsaScore * 0.10;
    } else {
      scores.hua  += rsaScore * 0.15;
      scores.huan += rsaScore * 0.10;
    }
  }

  // ES5 写法：4.0 引擎无 Object.values/entries（ES2017 API），白屏杀手
  const vals = Object.keys(scores).map(function (k) { return scores[k]; });
  const maxScore = Math.max.apply(null, vals.concat(0.01));
  Object.keys(scores).forEach(k => { scores[k] = Math.min(1, scores[k] / maxScore); });

  let bestType = 'huan', bestScore = 0;
  Object.keys(scores).forEach(k => { if (scores[k] > bestScore) { bestScore = scores[k]; bestType = k; } });

  const PULSE_TYPES = resolvePulseTypes();
  const info = PULSE_TYPES[bestType];
  return { type: bestType, name: info.name, description: info.desc, nature: info.nature, confidence: Math.round(bestScore * 100) / 100, allScores: scores };
}

// ============================================================================
// 体质判定
// ============================================================================
function assessConstitution(dimensions, mainPulse, metrics) {
  const { stress, sdnn, restingHr } = metrics;
  const scores = {};
  scores.balanced = dimensions.rate.score >= 6 && dimensions.rhythm.score >= 6 && dimensions.strength.score >= 5 && dimensions.tension.score >= 4 ? 0.8 : 0.2;
  scores.qi_deficiency   = (1 - Math.min(1, sdnn / 60)) * 0.5 + (1 - Math.min(1, dimensions.strength.score / 9)) * 0.5;
  scores.yang_deficiency = (restingHr < 58 ? 0.6 : 0.2) * 0.5 + (1 - Math.min(1, dimensions.strength.score / 9)) * 0.5;
  scores.yin_deficiency  = (restingHr > 78 ? 0.6 : 0.2) * 0.5 + Math.min(1, stress / 100) * 0.5;
  scores.qi_stagnation   = Math.min(1, stress / 80) * 0.5 + (1 - Math.min(1, sdnn / 70)) * 0.25 + (dimensions.tension.category === 'xian' || dimensions.tension.category === 'pian_xian' ? 0.7 : 0.2) * 0.25;
  scores.blood_stasis    = (1 - Math.min(1, sdnn / 50)) * 0.5 + (dimensions.tension.category === 'xian' ? 0.6 : 0.2) * 0.3 + (mainPulse.type === 'se' || mainPulse.type === 'jie' ? 0.5 : 0.1) * 0.2;
  scores.phlegm_damp     = (1 - Math.min(1, sdnn / 65)) * 0.4 + (dimensions.width.category === 'hong' || dimensions.width.category === 'pian_hong' ? 0.6 : 0.2) * 0.6;
  scores.damp_heat       = (restingHr > 72 ? 0.5 : 0.2) * 0.4 + Math.min(1, stress / 85) * 0.4 + (dimensions.strength.category === 'shi' ? 0.4 : 0.2) * 0.2;
  scores.allergic        = (dimensions.rhythm.category === 'pian_buqi' || dimensions.rhythm.category === 'jie_dai' ? 0.5 : 0.15) * 0.5 + (1 - Math.min(1, sdnn / 55)) * 0.5;

  const cvals = Object.keys(scores).map(function (k) { return scores[k]; });
  const maxScore = Math.max.apply(null, cvals.concat(0.01));
  Object.keys(scores).forEach(k => { scores[k] = Math.min(1, Math.max(0, scores[k] / maxScore)); });

  let bestType = 'balanced', bestScore = 0;
  Object.keys(scores).forEach(k => { if (scores[k] > bestScore) { bestScore = scores[k]; bestType = k; } });

  const CONSTITUTIONS = resolveConstitutions();
  const cnst = CONSTITUTIONS[bestType];
  return { type: bestType, name: cnst.name, description: cnst.desc, score: Math.round(bestScore * 100) / 100, allScores: scores };
}

// ============================================================================
// 五脏关联
// ============================================================================
function analyzeOrgans(dimensions, mainPulse, metrics) {
  const { stress, sdnn, restingHr, sleepScore } = metrics;
  const heartScore   = (dimensions.rhythm.score * 0.5 + dimensions.rate.score * 0.3 + (sleepScore || 5) / 10 * 2 * 0.2);
  const liverScore   = ((10 - dimensions.tension.score) * 0.4 + (stress > 50 ? (100 - stress) / 50 : 8) * 0.4 + dimensions.rate.score * 0.2);
  const spleenScore  = (dimensions.width.score * 0.4 + dimensions.strength.score * 0.4 + (restingHr > 60 && restingHr < 80 ? 7 : 4) * 0.2);
  const lungScore    = (dimensions.strength.score * 0.5 + dimensions.rhythm.score * 0.5);
  const kidneyScore  = (dimensions.strength.score * 0.5 + (restingHr < 75 ? 7 : 4) * 0.3 + (sdnn > 35 ? 7 : 4) * 0.2);

  const organs = [
    { organ: getText('organ_name_heart'),  score: Math.round(heartScore * 10) / 10 },
    { organ: getText('organ_name_liver'),  score: Math.round(liverScore * 10) / 10 },
    { organ: getText('organ_name_spleen'), score: Math.round(spleenScore * 10) / 10 },
    { organ: getText('organ_name_lung'),   score: Math.round(lungScore * 10) / 10 },
    { organ: getText('organ_name_kidney'), score: Math.round(kidneyScore * 10) / 10 },
  ];

  organs.forEach(o => {
    if (o.score >= 7)      o.status = getText('organ_status_he');
    else if (o.score >= 5) o.status = getText('organ_status_ping');
    else if (o.score >= 3) o.status = getText('organ_status_xu');
    else                   o.status = getText('organ_status_kui');
    o.desc = getText(organDescKey(o.organ, o.status));
  });
  return organs;
}

// ============================================================================
// 养生建议
// ============================================================================
function generateRecommendations(dimensions, constitution, organAnalysis) {
  const recs = [];
  const worstOrgan = organAnalysis.reduce((a, b) => a.score < b.score ? a : b);

  // 饮食
  const dietAdvice = [];
  if (constitution.type === 'qi_deficiency') dietAdvice.push(getText('rec_diet_qi_def'));
  else if (constitution.type === 'yang_deficiency') dietAdvice.push(getText('rec_diet_yang_def'));
  else if (constitution.type === 'yin_deficiency') dietAdvice.push(getText('rec_diet_yin_def'));
  else if (constitution.type === 'qi_stagnation') dietAdvice.push(getText('rec_diet_qi_stag'));
  else dietAdvice.push(getText('rec_diet_default'));
  recs.push({ category: getText('rec_cat_diet'), advice: dietAdvice.join(getText('rec_separator')) });

  // 作息
  const restAdvice = [];
  if (worstOrgan.organ === getText('organ_name_liver') || constitution.type === 'qi_stagnation') {
    restAdvice.push(getText('rec_rest_liver'));
  } else if (worstOrgan.organ === getText('organ_name_heart')) {
    restAdvice.push(getText('rec_rest_heart'));
  } else {
    restAdvice.push(getText('rec_rest_default'));
  }
  if (dimensions.tension.category === 'xian' || dimensions.tension.category === 'pian_xian') {
    restAdvice.push(getText('rec_rest_no_caffeine'));
  }
  recs.push({ category: getText('rec_cat_rest'), advice: restAdvice.join(getText('rec_separator')) });

  // 运动
  const exerciseAdvice = [];
  if (constitution.type === 'qi_deficiency' || constitution.type === 'yang_deficiency') {
    exerciseAdvice.push(getText('rec_exercise_gentle'));
  } else if (constitution.type === 'qi_stagnation' || dimensions.tension.category === 'xian') {
    exerciseAdvice.push(getText('rec_exercise_cardio'));
  } else {
    exerciseAdvice.push(getText('rec_exercise_default'));
  }
  recs.push({ category: getText('rec_cat_exercise'), advice: exerciseAdvice.join(getText('rec_separator')) });

  // 情志
  const mindAdvice = [];
  if (dimensions.tension.category === 'xian') {
    mindAdvice.push(getText('rec_mind_meditate'));
  } else if (constitution.type === 'qi_stagnation') {
    mindAdvice.push(getText('rec_mind_social'));
  } else {
    mindAdvice.push(getText('rec_mind_default'));
  }
  if (worstOrgan.organ === getText('organ_name_liver')) mindAdvice.push(getText('rec_mind_no_anger'));
  if (worstOrgan.organ === getText('organ_name_heart')) mindAdvice.push(getText('rec_mind_no_overjoy'));
  recs.push({ category: getText('rec_cat_mind'), advice: mindAdvice.join(getText('rec_separator')) });

  return recs;
}

// ============================================================================
// 趋势分析
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
// RSA 呼吸-心率耦合评估
// ============================================================================
function classifyRsa(eiRatio) {
  if (eiRatio == null || eiRatio <= 0) return { value: 0, category: 'unknown', label: getText('dim_label_unknown'), score: 5 };
  if (eiRatio < 1.03) return { value: eiRatio, category: 'rigid',      label: getText('dim_label_rsa_rigid'),      score: 2 };
  if (eiRatio < 1.06) return { value: eiRatio, category: 'blunted',    label: getText('dim_label_rsa_blunted'),    score: 4 };
  if (eiRatio < 1.10) return { value: eiRatio, category: 'normal',     label: getText('dim_label_rsa_normal'),     score: 6 };
  if (eiRatio < 1.15) return { value: eiRatio, category: 'flexible',   label: getText('dim_label_rsa_flexible'),   score: 8 };
  return { value: eiRatio, category: 'highly_flexible', label: getText('dim_label_rsa_highly_flexible'), score: 9 };
}

// ============================================================================
// 主入口
// ============================================================================
export function diagnosePulse(metrics) {
  const { 
    sdnn = 0, sdann = 0, restingHr = 0, avgHr = 0, mean_hr = 0, 
    hrStability = 0, sdnnSegments = [], stress = 0, sleepScore = 0, 
    hrReserve = 0, patternEntropy = 0, lfRms = 0, vlfRms = 0,
    rsaEiRatio = 0
  } = metrics;

  // 使用新提取的非线性指标 (Pattern Entropy) 和 频域 (LF/VLF RMS) 修正节律和宽度
  let adjustedSdnn = sdnn;
  let adjustedStress = stress;

  if (patternEntropy > 0) {
    if (patternEntropy < 1.0) adjustedSdnn = Math.max(0, adjustedSdnn - 10);
    else if (patternEntropy > 2.5) adjustedSdnn = Math.min(100, adjustedSdnn + 10);
  }

  if (lfRms > 0 && vlfRms > 0) {
    const lfVlfRatio = lfRms / vlfRms;
    if (lfVlfRatio > 2.0) adjustedStress = Math.min(100, adjustedStress + 15);
    else if (lfVlfRatio < 0.5) adjustedStress = Math.max(0, adjustedStress - 15);
  }

  const dimensions = {
    rate:     classifyRate(restingHr || avgHr || mean_hr),
    rhythm:   classifyRhythm(adjustedSdnn),
    strength: classifyStrength(sdann, hrReserve),
    width:    classifyWidth(hrStability, adjustedStress),
    tension:  classifyTension(adjustedStress, adjustedSdnn),
    rsa:      classifyRsa(rsaEiRatio)
  };

  let segmentTrend = 'stable';
  if (sdnnSegments.length >= 3) {
    const first = sdnnSegments.slice(0, Math.ceil(sdnnSegments.length / 2));
    const second = sdnnSegments.slice(Math.ceil(sdnnSegments.length / 2));
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
    if (avgFirst > 0 && avgSecond / avgFirst > 1.1) segmentTrend = 'relaxing';
    else if (avgFirst > 0 && avgSecond / avgFirst < 0.9) segmentTrend = 'tiring';
  }

  const mainPulse = matchPulseType(dimensions, metrics);
  const constitution = assessConstitution(dimensions, mainPulse, metrics);
  const organAnalysis = analyzeOrgans(dimensions, mainPulse, metrics);
  const recommendations = generateRecommendations(dimensions, constitution, organAnalysis);

  return { mainPulse, dimensions, constitution, organAnalysis, recommendations, segmentTrend, timestamp: Date.now() };
}
