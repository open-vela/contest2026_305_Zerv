/**
 * Vela 4.0 JSON 文件存储层。
 *
 * 仅使用 @system.file，不依赖在部分 4.0 固件中不稳定的 @system.storage。
 * 同一文件的读、写、删除操作严格串行，回调只在真实 I/O 完成后触发。
 */
import file from '@system.file'

const ROOT_URI = 'internal://files/'
const cache = {}
const cacheReady = {}
const queues = {}

function safeName(fileName) {
  return String(fileName || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

function uriOf(fileName) {
  return ROOT_URI + safeName(fileName)
}

function invoke(callback, error, value) {
  if (callback) callback(error, value)
}

function queueFor(fileName) {
  const name = safeName(fileName)
  if (!queues[name]) {
    queues[name] = {
      running: false,
      jobs: []
    }
  }
  return queues[name]
}

function enqueue(fileName, label, operation) {
  const name = safeName(fileName)
  const queue = queueFor(name)
  queue.jobs.push({
    label,
    operation
  })
  console.log('[FILE-STORAGE] enqueue ' + label + ' ' + name + ', pending=' + queue.jobs.length)
  drain(name)
}

function drain(fileName) {
  const queue = queueFor(fileName)
  if (queue.running || queue.jobs.length === 0) return

  const job = queue.jobs.shift()
  queue.running = true
  console.log('[FILE-STORAGE] begin ' + job.label + ' ' + fileName)

  let finished = false
  const done = function () {
    if (finished) return
    finished = true
    queue.running = false
    console.log('[FILE-STORAGE] end ' + job.label + ' ' + fileName + ', remain=' + queue.jobs.length)
    drain(fileName)
  }

  try {
    job.operation(done)
  } catch (error) {
    console.log('[FILE-STORAGE] exception ' + job.label + ' ' + fileName + ': ' + error)
    done()
  }
}

function readJob(fileName, callback) {
  enqueue(fileName, 'read', function (done) {
    if (cacheReady[fileName]) {
      console.log('[FILE-STORAGE] cache hit ' + fileName)
      invoke(callback, null, cache[fileName])
      done()
      return
    }

    file.readText({
      uri: uriOf(fileName),
      encoding: 'UTF-8',
      success: function (result) {
        try {
          const parsed = JSON.parse(result.text)
          cache[fileName] = parsed
          cacheReady[fileName] = true
          console.log('[FILE-STORAGE] read success ' + fileName + ', bytes=' + result.text.length)
          invoke(callback, null, parsed)
        } catch (error) {
          console.log('[FILE-STORAGE] JSON parse failed ' + fileName + ': ' + error)
          invoke(callback, {
            code: 'JSON_PARSE',
            message: String(error)
          }, null)
        }
        done()
      },
      fail: function (data, code) {
        if (code === 301) {
          console.log('[FILE-STORAGE] file not found ' + fileName)
          cache[fileName] = null
          cacheReady[fileName] = true
          invoke(callback, null, null)
        } else {
          console.log('[FILE-STORAGE] read failed ' + fileName + ', code=' + code + ', data=' + data)
          invoke(callback, {
            code,
            message: String(data || 'read failed')
          }, null)
        }
        done()
      }
    })
  })
}

export const Storage = {
  set(fileName, data, callback) {
    const name = safeName(fileName)
    if (!name) {
      invoke(callback, { code: 202, message: 'empty file name' }, false)
      return
    }

    if (data === null) {
      this.remove(name, callback)
      return
    }

    let text = ''
    try {
      text = JSON.stringify(data)
    } catch (error) {
      console.log('[FILE-STORAGE] stringify failed ' + name + ': ' + error)
      invoke(callback, {
        code: 'JSON_STRINGIFY',
        message: String(error)
      }, false)
      return
    }

    enqueue(name, 'write', function (done) {
      file.writeText({
        uri: uriOf(name),
        text,
        encoding: 'UTF-8',
        append: false,
        success: function () {
          cache[name] = data
          cacheReady[name] = true
          console.log('[FILE-STORAGE] write success ' + name + ', bytes=' + text.length)
          invoke(callback, null, true)
          done()
        },
        fail: function (failureData, code) {
          console.log('[FILE-STORAGE] write failed ' + name + ', code=' + code + ', data=' + failureData)
          invoke(callback, {
            code,
            message: String(failureData || 'write failed')
          }, false)
          done()
        }
      })
    })
  },

  get(fileName, callback) {
    const name = safeName(fileName)
    if (!name) {
      invoke(callback, { code: 202, message: 'empty file name' }, null)
      return
    }
    readJob(name, callback)
  },

  patch(fileName, patchData, callback) {
    const name = safeName(fileName)
    this.get(name, (error, currentData) => {
      if (error) {
        invoke(callback, error, false)
        return
      }
      const nextData = Object.assign({}, currentData || {}, patchData || {})
      this.set(name, nextData, callback)
    })
  },

  getField(fileName, field, callback) {
    this.get(fileName, function (error, data) {
      if (error) {
        invoke(callback, error, null)
        return
      }
      const value = data && typeof data === 'object' ? data[field] : null
      invoke(callback, null, value)
    })
  },

  remove(fileName, callback) {
    const name = safeName(fileName)
    if (!name) {
      invoke(callback, { code: 202, message: 'empty file name' }, false)
      return
    }

    enqueue(name, 'delete', function (done) {
      file.delete({
        uri: uriOf(name),
        success: function () {
          delete cache[name]
          delete cacheReady[name]
          console.log('[FILE-STORAGE] delete success ' + name)
          invoke(callback, null, true)
          done()
        },
        fail: function (failureData, code) {
          delete cache[name]
          delete cacheReady[name]
          // 删除不存在的文件也视为目标状态已达成。
          console.log('[FILE-STORAGE] delete finished ' + name + ', code=' + code)
          invoke(callback, null, true)
          done()
        }
      })
    })
  },

  clearCache(fileName) {
    if (fileName) {
      const name = safeName(fileName)
      delete cache[name]
      delete cacheReady[name]
      return
    }
    Object.keys(cache).forEach(function (name) {
      delete cache[name]
      delete cacheReady[name]
    })
  }
}
