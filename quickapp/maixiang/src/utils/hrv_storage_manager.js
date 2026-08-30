/**
 * HRV 数据存储管理器
 * 按日期分离存储当天和历史数据，优化读写性能
 */

import { Storage } from './storage';

const TODAY_FILE = 'hrv_today.json';
const HISTORY_PREFIX = 'hrv_history_';
const HISTORY_INDEX_FILE = 'hrv_history_index.json';
// 历史保留天数：Vela 官方文档要求小内存设备及时清理无用文件
const MAX_HISTORY_DAYS = 14;

export class HrvStorageManager {
  constructor() {
    this.todayCache = null;
    this.todayDate = null;
    this.historyIndex = null;
  }

  /**
   * 获取今日数据文件的键名
   */
  _getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}-${('0' + now.getDate()).slice(-2)}`;
  }

  /**
   * 获取历史数据文件名
   */
  _getHistoryFileKey(dateStr) {
    return `${HISTORY_PREFIX}${dateStr}.json`;
  }

  /**
   * 初始化存储管理器
   */
  init(callback) {
    // 检查是否需要将旧数据归档
    this._checkAndArchiveOldData(() => {
      // 加载今日数据到缓存
      this._loadTodayData(() => {
        // 加载历史索引
        this._loadHistoryIndex(() => {
          // 清理超期历史文件（保留最近 MAX_HISTORY_DAYS 天）
          this._pruneHistory(() => {
            callback();
          });
        });
      });
    });
  }

  /**
   * 历史保留策略：索引超出 MAX_HISTORY_DAYS 时删除最旧的历史文件与索引项
   */
  _pruneHistory(callback) {
    const idx = this.historyIndex || [];
    if (idx.length <= MAX_HISTORY_DAYS) {
      callback();
      return;
    }
    const sorted = idx.slice().sort(); // YYYY-MM-DD 字典序即时间序
    const keep = sorted.slice(-MAX_HISTORY_DAYS);
    const drop = sorted.slice(0, sorted.length - MAX_HISTORY_DAYS);
    drop.forEach((dateStr) => {
      Storage.remove(this._getHistoryFileKey(dateStr));
    });
    this.historyIndex = keep;
    Storage.set(HISTORY_INDEX_FILE, keep, () => {
      callback();
    });
  }

  /**
   * 检查并归档旧数据。根据首条记录的时间戳判断数据真实日期，
   * 而非依赖缓存的 todayDate（首次加载时为 null，会导致误判）。
   */
  _checkAndArchiveOldData(callback) {
    Storage.get(TODAY_FILE, (err, todayData) => {
      if (!todayData || !Array.isArray(todayData) || todayData.length === 0) {
        callback();
        return;
      }

      const todayStr = this._getTodayKey();

      // 根据首条记录的时间戳判断数据真实日期
      let dataDate = todayStr;
      if (todayData[0] && todayData[0].timestamp) {
        const d = new Date(todayData[0].timestamp);
        dataDate = `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)}`;
      }

      // 数据是今天的，保持不动
      if (dataDate === todayStr) {
        this.todayDate = todayStr;
        callback();
        return;
      }

      // 数据是旧日期的，归档到对应日期的历史文件
      const historyFile = this._getHistoryFileKey(dataDate);
      Storage.set(historyFile, todayData, () => {
        this._addToHistoryIndex(dataDate, () => {
          Storage.set(TODAY_FILE, [], () => {
            this.todayCache = null;
            this.todayDate = todayStr;
            callback();
          });
        });
      });
    });
  }

  /**
   * 加载今日数据到缓存
   */
  _loadTodayData(callback) {
    const todayStr = this._getTodayKey();

    if (this.todayDate === todayStr && this.todayCache) {
      // 缓存命中
      callback();
      return;
    }

    Storage.get(TODAY_FILE, (err, data) => {
      this.todayCache = data || [];
      this.todayDate = todayStr;
      callback();
    });
  }

  /**
   * 加载历史索引
   */
  _loadHistoryIndex(callback) {
    Storage.get(HISTORY_INDEX_FILE, (err, index) => {
      this.historyIndex = index || [];
      callback();
    });
  }

  /**
   * 添加到历史索引
   */
  _addToHistoryIndex(dateStr, callback) {
    Storage.get(HISTORY_INDEX_FILE, (err, index) => {
      let historyIndex = index || [];
      if (historyIndex.indexOf(dateStr) === -1) {
        historyIndex.push(dateStr);
        Storage.set(HISTORY_INDEX_FILE, historyIndex, () => {
          if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    });
  }

  /**
   * 添加一条 HRV 记录（总是添加到今日数据）
   */
  addRecord(record, callback) {
    this._loadTodayData(() => {
      if (!this.todayCache) {
        this.todayCache = [];
      }

      this.todayCache.push(record);

      // 保存到今日文件
      Storage.set(TODAY_FILE, this.todayCache, (error) => {
        if (error) {
          // 落盘失败时撤销本次内存追加，避免界面误以为已经保存。
          this.todayCache.pop();
          console.log('[HRV-STORAGE] addRecord failed: ' + JSON.stringify(error));
          if (callback) callback(error);
          return;
        }
        console.log('[HRV-STORAGE] addRecord success, count=' + this.todayCache.length);
        if (callback) callback(null);
      });
    });
  }

  /**
   * 获取今日所有数据
   */
  getTodayData(callback) {
    this._loadTodayData(() => {
      callback(this.todayCache || []);
    });
  }

  /**
   * 获取指定日期的历史数据
   */
  getHistoryData(dateStr, callback) {
    const historyFile = this._getHistoryFileKey(dateStr);
    Storage.get(historyFile, (err, data) => {
      callback(data || []);
    });
  }

  /**
   * 获取所有历史日期索引
   */
  getHistoryIndex(callback) {
    this._loadHistoryIndex(() => {
      callback(this.historyIndex || []);
    });
  }

  /**
   * 获取最近 N 天的数据（跨文件查询）
   */
  getRecentDays(days, callback) {
    const result = [];

    // 先获取今日数据
    this.getTodayData((todayData) => {
      result.push(...todayData);

      // 如果只需要今日数据，直接返回
      if (days === 1) {
        callback(result);
        return;
      }

      // 从历史索引中获取最近几天的日期
      this.getHistoryIndex((historyIndex) => {
        const sortedHistory = historyIndex.sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // 按日期降序
        let fetchedDays = 0;
        let historyDataPromises = [];

        // 异步获取历史数据
        for (let i = 0; i < sortedHistory.length && fetchedDays < days - 1; i++) {
          const dateStr = sortedHistory[i];
          historyDataPromises.push(new Promise(resolve => {
            this.getHistoryData(dateStr, (dayData) => {
              result.push(...dayData);
              fetchedDays++;
              resolve();
            });
          }));
        }

        // 等待所有历史数据获取完毕
        Promise.all(historyDataPromises).then(() => {
          callback(result);
        });
      });
    });
  }

  /**
   * 清除所有历史数据（保留今日数据）
   */
  clearHistory(callback) {
    this._loadHistoryIndex(() => {
      if (!this.historyIndex || this.historyIndex.length === 0) {
        if (callback) callback();
        return;
      }

      let deletedCount = 0;
      this.historyIndex.forEach((dateStr) => {
        const historyFile = this._getHistoryFileKey(dateStr);
        Storage.remove(historyFile); // Storage.remove 是同步的，不需要回调
        deletedCount++;
        if (deletedCount >= this.historyIndex.length) {
          // 清空索引
          Storage.set(HISTORY_INDEX_FILE, [], () => {
            this.historyIndex = [];
            if (callback) callback();
          });
        }
      });
    });
  }

  /**
   * 清除今日数据
   */
  clearToday(callback) {
    Storage.set(TODAY_FILE, [], () => {
      this.todayCache = [];
      if (callback) callback();
    });
  }

  /**
   * 获取存储统计信息
   */
  getStats(callback) {
    const stats = {
      todayCount: 0,
      historyDays: 0,
      totalRecords: 0
    };

    this.getTodayData((todayData) => {
      stats.todayCount = todayData.length;
      stats.totalRecords += todayData.length;

      this.getHistoryIndex((index) => {
        stats.historyDays = index.length;

        // 计算历史总记录数（可选，可能需要较长时间）
        let loadedCount = 0;
        if (index.length === 0) {
          callback(stats);
          return;
        }

        index.forEach((dateStr) => {
          this.getHistoryData(dateStr, (dayData) => {
            stats.totalRecords += dayData.length;
            loadedCount++;

            if (loadedCount >= index.length) {
              callback(stats);
            }
          });
        });
      });
    });
  }
}
