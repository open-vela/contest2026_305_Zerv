# Vela 4.0 JS 运行时限制与白屏排查

> **这是本项目最耗时、也最值得沉淀的一条经验。**
> 低版本（4.0 量产固件）引擎的 JS 运行时 API 只到 ES5 水平。

---

## 一、症状：整页白屏，且没有任何报错

这是最坑的地方 —— 排查时没有任何线索：

- 页面的 `PageCreate` 正常；
- `dmesg` 里 JS **没有任何异常**；
- 就是**不上屏**，整页白屏。

**根因**：babel **只转语法、不补 API**。使用了 ES2016+ 的 API 后，
模块初始化阶段**静默失败**，不会抛出可捕获的错误。

---

## 二、禁用 API 与 ES5 替代写法

| 禁用（ES2016+ API） | 替代（ES5） |
|---|---|
| `Object.values(o)` | `Object.keys(o).map(function (k) { return o[k] })` |
| `Object.entries(o)` | `Object.keys(o)` 遍历后取 `o[k]` |
| `arr.includes(x)` | `arr.indexOf(x) !== -1` |
| `Math.max(...arr)` | `Math.max.apply(null, arr)` |

**实测在该镜像上可正常使用**：

- `String.prototype.padStart`（该镜像有）
- 箭头函数 / 解构 / 模板字符串（babel 负责转语法）
- `position: absolute`（正常）
- `chart` / `progress` / `image` / `router.push`（正常）

---

## 三、白屏排查高效路径

按这个顺序走，一次即可锁定有毒模块：

1. 建一个**零依赖探针页**作为入口 → 确认框架本身正常；
2. 把可疑页面**砍成骨架模板 + 裸 `script`** → 确认页面能上屏；
3. **逐步加回 `import`**，每加一个跑一次 → 定位到具体模块；
4. 对该模块 grep：
   ```
   Object\.(values|entries)|\.includes\(
   ```
5. 替换为 ES5 写法后重跑。

---

## 四、预防措施

移植或新建页面时，养成两个习惯：

1. 提交前对全仓 grep 一遍上述模式；
2. 新增页面先在探针页里验证能上屏，再接入真实数据。
