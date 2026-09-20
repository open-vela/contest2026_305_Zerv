# 构建与调试

> 适用：openvela 快应用 + `aiot-toolkit` 工具链（Windows 环境验证）。

---

## 一、构建命令

```bash
npm install
npm run build      # 产出调试 RPK
npm run start      # 开发监听
```

---

## 二、常见构建异常与处置

### 1. `.temp_*/src/manifest.json 不存在`

`aiot-toolkit` 报此异常时，**删除项目同级的 `.temp_<项目名>` 临时镜像目录**后重跑即可
（该目录是纯缓存，删掉无损）。

### 2. 多工程共存时的依赖共享

多个快应用工程并存时，`node_modules` 可用**目录联接（Junction）**共享，
工具链版本天然一致，省去重复下载。

### 3. IDE watch 任务竞态

**IDE 的 watch 任务只能存在一个。**

- 判据：日志中出现**两份相同的 `start build`** 即为双任务竞态；
- 后果：产物损坏、模拟器反复 reboot；
- 处置：全部停止后重跑。

---

## 三、adb 直控部署流程（绕开 IDE 竞态）

当 IDE 监听任务互相干扰时，直接用 adb 部署更稳：

```bash
# 1. 推送 RPK 到设备
~/.vela/sdk/tools/adb/win/adb.exe push <包名>.rpk /data/

# 2. 解包到快应用目录
... shell unzip -o /data/<包名>.rpk -d /data/quickapp/app/<包名>

# 3. 启动应用（前台阻塞：杀掉 shell 即杀掉应用）
... shell vapp app/<包名>
```

**运行时日志**：`shell dmesg`（其中包含 AIOTJS framework trace）。

---

## 四、调试经验

- **优先取证再修改**。每次改动前先拿到可复现的现象或日志，避免凭猜测改代码。
- 白屏类问题先怀疑 ES5 API 兼容性 → 见 `es5-runtime-limits.md`。
- 页面渲染/布局异常先怀疑样式禁区 → 见 `graphics-and-style.md`。
- 存储读到旧数据先怀疑读写竞态 → 见 `health-and-storage.md`。
