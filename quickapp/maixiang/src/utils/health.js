// service.health 5.0 接口封装层。
// 移植自官方示例 vela_demo/wearable/health-demo/src/pages/index/health.js。
//
// 官方回调结构（已验证）：
//   getRecentSamples.success(list)   list = [{ dataType, data: { timeStamp, value } }, ...]
//   subscribeSample.callback(sample) sample = { timeStamp, value }
//   两者 fail(data, code)，code 203 = 功能不支持
import health from '@service.health'

/** service.health 的数据类型常量（HEART_RATE / SPO2 / STRESS 等），直接取模块自带常量。 */
export const DATA_TYPES = health.DATA_TYPES

/**
 * 一次性获取最近采样（Promise）。
 * @param {number[]} dataTypes 要查询的数据类型数组
 * @returns {Promise<Array<{ok:boolean, dataType?:number, value?:number, timeStamp?:number}>>}
 */
export function getRecent(dataTypes) {
  return health
    .getRecentSamples({ dataTypes })
    .then((list) =>
      (list || []).map((it) => ({
        ok: true,
        dataType: it.dataType,
        value: it.data && it.data.value,
        timeStamp: it.data && it.data.timeStamp
      }))
    )
    .catch((error) => {
      console.log('[health] getRecentSamples failed: ' + JSON.stringify(error));
      return [];
    })
}

/**
 * 订阅某类型，数据更新时持续回调（流式接口，多次回调）。
 * 订阅应贯穿页面生命周期，仅在页面销毁时退订；后台依赖 manifest 的 background feature。
 * @param {number} dataType 数据类型
 * @param {function({ok:boolean, dataType?:number, value?:number, timeStamp?:number}): void} onSample 数据回调
 * @param {function({ok:boolean, code?:number, unsupported?:boolean}): void} [onError] 失败回调
 * @returns {void}
 */
export function subscribe(dataType, onSample, onError) {
  health.subscribeSample({
    dataType,
    callback: (s) => {
      onSample({ ok: true, dataType, value: s.value, timeStamp: s.timeStamp })
    },
    fail: (data, code) => {
      if (onError) {
        onError({ ok: false, code, unsupported: code === 203 })
      }
    }
  })
}

/**
 * 取消订阅（页面销毁时调用）。
 * @param {number} dataType 数据类型
 * @returns {void}
 */
export function unsubscribe(dataType) {
  health.unsubscribeSample({ dataType })
}
