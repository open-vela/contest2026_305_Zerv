/**
 * pulse_shape.js — 脉象波形点阵生成器（openvela chart 版）
 * 原 Zepp OS 版输出 GRADKIENT_POLYLINE 的 {x,y} 点阵；
 * 此版输出 chart line 组件的数值数组（0~100，值越大越靠上），形态参数不变。
 */
var N = 160;         // chart 采样点数（密度越高曲线越平滑）
var TOP = 96, BOT = 4;

function clamp(v) { return Math.max(BOT, Math.min(TOP, v)); }

// centerY/amp 以 0~100 值域表示（50 为中轴）
function sinWave(cycles, amp, centerY) {
  var pts = [];
  for (var i = 0; i <= N; i++) {
    pts.push(Math.round(clamp(centerY + amp * Math.sin((i / N) * 2 * Math.PI * cycles))));
  }
  return pts;
}

function triWave(cycles, amp, centerY) {
  var pts = [];
  var per = N / cycles;
  for (var i = 0; i <= N; i++) {
    var phase = (i % per) / per;
    var t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    pts.push(Math.round(clamp(centerY + amp * (t * 2 - 1))));
  }
  return pts;
}

function jitterWave(cycles, amp, centerY, jitterAmp) {
  var pts = [];
  for (var i = 0; i <= N; i++) {
    var j = (Math.sin(i * 7.3) + Math.sin(i * 13.7)) * jitterAmp;
    pts.push(Math.round(clamp(centerY + amp * Math.sin((i / N) * 2 * Math.PI * cycles) + j)));
  }
  return pts;
}

function gapWave(cycles, amp, centerY, gapFracs) {
  var pts = [];
  for (var i = 0; i <= N; i++) {
    var gap = gapFracs.some(function (g) { return Math.abs(i - g * N) <= N / 20; });
    pts.push(gap ? Math.round(centerY) : Math.round(clamp(centerY + amp * Math.sin((i / N) * 2 * Math.PI * cycles))));
  }
  return pts;
}

export function getPulseShape(pulseType) {
  var shapes = {
    fu:   sinWave(4,   45 * 0.9, 42),          // 浮：位浅（偏上），幅大
    chen: sinWave(3.5, 28, 72),                // 沉：位深（偏下）
    chi:  sinWave(2.5, 42, 50),                // 迟：周期少
    shuo: sinWave(7,   38, 50),                // 数：周期密
    hua:  sinWave(4.5, 44, 50),                // 滑：流利圆滑
    se:   jitterWave(3, 30, 55, 14),           // 涩：抖动艰涩
    xu:   sinWave(4,   14, 58),                // 虚：幅小无力
    shi:  triWave(4,   46, 50),                // 实：锐利有力
    xian: triWave(5,   47, 50),                // 弦：绷急如弦
    xi:   sinWave(5,   9,  50),                // 细：如线
    hong: sinWave(3,   48, 50),                // 洪：宽大
    huan: sinWave(4,   38, 50),                // 缓：从容和缓
    jie:  gapWave(4,   38, 50, [0.25, 0.55, 0.85]),        // 结：不定歇止
    dai:  gapWave(4,   38, 50, [0, 0.25, 0.5, 0.75, 1]),   // 代：定数歇止
    flat: sinWave(1,   0,  50),                // 无数据：平线
  };
  return shapes[pulseType] || shapes.huan;
}
