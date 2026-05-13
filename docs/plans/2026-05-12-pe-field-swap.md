# 修正 PE 標籤錯位：`本益比4` → 「PE」、`本益比` → 「PE(預估)」（2026-05-12）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：把網頁第一區塊兩張 PE 卡片的「資料來源」與「標籤」對調；同時把 `stock_summary.js` 估值文案的 PE 來源改成 TTM（`本益比4`），與證交所對齊。**僅針對個股**（dottdot 對類股 TWA00 / TWC00 / TWBXX 的 PE 算法不同，本計畫不涵蓋）。
> **不在範圍**：dottdot 表的其他欄位、PB、EPS、總市值、其他 module 的數值計算、tooltip 文案的 HTML 框架（如要加 tooltip 提示，本計畫只動文字內容）、類股 PE。

---

## 一、問題與動機

### 1.1 dottdot 官方答覆（2026-05-12）

dottdot 已正式回覆兩個欄位的計算定義：

**`本益比4`（近 4 季 TTM）**

```
本益比(近四季) = 收盤價 / (近四季稅後純益 / (股本(百萬) × 1000 / 每股面額(元)))
近四季稅後純益 = 近四季 [母公司業主-稅後純益(千)] 加總；< 0 不予計算
```

**`本益比`（當年機構預估，含 TTM fallback）**

```
本益比 = 收盤價 / (當年稅後純益 / (股本(百萬) × 1000 / 每股面額(元)))
當年稅後純益取數順序：
  1. 月機構預估盈餘與 EPS 表中，當時最新「機構預估年稅後純益」
  2. 若無機構估值，則以「當時財報公告的近四季稅後純益累計值」計算
```

### 1.2 結論：先前的標籤剛好相反

| dottdot 欄位 | 實際語意 | 目前 UI 標籤 | 應有標籤 |
|---|---|---|---|
| `本益比4` | **近 4 季**：用近 4 季母公司業主稅後純益、股本與每股面額推算 ─ 與證交所 BWIBBU_d 一致 | 「PE₄(預估)」❌ | **「PE」** ✓ |
| `本益比` | **當年預估**：優先取機構預估年稅後純益；**無機構預估時 fallback 為近 4 季累計** | 「PE」❌ | **「PE(預估)」** ✓ |

實證對照（**僅限 2026-05-05/06 抽樣**，實作時請以當下 dottdot quote date 與 TWSE BWIBBU date 對齊後重新驗證）：

| 股票 | dottdot `本益比` | dottdot `本益比4` | 證交所 BWIBBU_d `PE` |
|---|---|---|---|
| 2330 | 22.7 | **34.0** | **33.97** |
| 2882 | 11.5 | **11.7** | **11.68** |

`本益比4` 與證交所完全對齊（差 < 0.1），確認近 4 季口徑相同。`本益比` 數值較低 ─ 對 2330 來說，**可能反映機構預估 2026 全年 EPS 高於過去 4 季實際**（不能直接推論「市場看好」，因為預估 EPS 高的成因有很多，例如基期低、一次性業外、產業景氣循環，需結合其他資訊判斷）。

注意：「近 4 季實際 EPS」不直接等於頁面上「EPS(近4季)」卡片所顯示的 EPS 加總值。dottdot 的 `本益比4` 公式拆解的是「母公司業主稅後純益(千) / (股本(百萬) × 1000 / 每股面額)」，與頁面 EPS 來源（季報每股盈餘加總）並非同一條計算路徑，理論上應接近但不一定完全一致。

### 1.3 為什麼「兩個都留」而不是「砍掉一個」

先前的計畫（在 dottdot 回覆前）建議移除 `本益比` 只留 `本益比4`。現在語意明確之後，**兩個都有資訊價值**：

- **PE（`本益比4`，近 4 季）**：與證交所 BWIBBU_d 及常見 trailing PE 口徑對齊、看歷史獲利、保守、信任感
- **PE(預估)（`本益比`，當年預估含 fallback）**：看機構對未來獲利的預期，與 PE 並列時可衍生「PE(預估) 顯著低於 PE → 機構預估比過去 4 季更樂觀」這類觀察。**fallback 情境要小心**：若該股當下沒有機構預估，dottdot 會回退到近 4 季累計值，導致 PE(預估) 數值等於 PE ─ 此時兩欄相同代表「沒有預估資訊」，而非「機構預期與歷史一致」

兩個並列、標籤精確化，比砍掉任一個都更合理。

### 1.4 現況程式

[`js/modules/profile.js:74-75, 120-121`](../../js/modules/profile.js)：

```js
const pe = quote?.["本益比"];        // 實際是「當年預估含 fallback」，但標籤寫「PE」
const pe4 = quote?.["本益比4"];      // 實際是 TTM，但標籤寫「PE₄(預估)」
...
${metricCard("PE", pe, 1)}
${metricCard("PE₄(預估)", pe4, 1)}
```

[`js/modules/stock_summary.js:251`](../../js/modules/stock_summary.js)：

```js
const pe = quote?.["本益比"];   // 用的是「當年預估」；應改為近 4 季（與閾值語意對齊）
```

`stock_summary.js` 的 `classifyValuation()` 分檔閾值是針對「標準 PE」設計，**近 4 季 PE 才符合這個語意**：

| value | 分檔 |
|---|---|
| < 0 | loss（PE 為負） |
| 0 ~ < 10 | 偏低 |
| 10 ~ 20 | 合理 |
| > 20 ~ 30 | 偏高 |
| > 30 | 明顯偏高 |

目前用「當年預估」會讓 2330 這類股被分到「偏高」（22.7）而不是「明顯偏高」（34）。實作後敘述會從**偏高**變成**明顯偏高**。

## 二、設計

| 元素 | 改動 |
|---|---|
| `profile.js` 「PE」卡片 | **資料來源換成 `本益比4`**（TTM）；標籤「PE」維持不變 |
| `profile.js` 「PE₄(預估)」卡片 | **標籤改成「PE(預估)」**；資料來源換成 `本益比`（當年預估，無預估時 fallback 近 4 季）|
| 兩張卡片順序 | 維持：PE → PE(預估) → PB → 每股淨值 → EPS(近4季) → 總市值 → 週轉率 |
| `stock_summary.js` 估值文案 | **資料來源換成 `本益比4`**（TTM），與分檔閾值語意對齊；文案中的「PE」字串維持不變 |

不需要：
- 動 HTML（標籤都來自 JS template literal）
- 動 CSS（卡片數量沒變）
- 動 data fetching（兩個欄位本來就在同一個 query）
- 動 `classifyValuation()` 邏輯或閾值

## 三、實作步驟

### Step 1 ─ `profile.js` 把兩張卡片的來源與標籤校正

```js
// js/modules/profile.js

// 改前
const pe = quote?.["本益比"];
const pe4 = quote?.["本益比4"];
...
${metricCard("PE", pe, 1)}
${metricCard("PE₄(預估)", pe4, 1)}

// 改後
const peTtm = sanitizePe(quote?.["本益比4"]);          // 近 4 季，與證交所一致
const peEstimate = sanitizePe(quote?.["本益比"]);      // 當年預估，無預估時 fallback 近 4 季
...
${metricCard("PE", peTtm, 1)}
${metricCard("PE(預估)", peEstimate, 1)}
```

新增本地 helper `sanitizePe(v)`：

```js
// PE 專用 guard：dottdot 公式註明「累計小於 0 不予計算」，當下回傳可能是 null/0；
// metricCard 對 0 會顯示 "0.0" 而非 "—"，PE = 0 並無經濟意義，視為無效。
// 注意：負值放行；profile 卡片不另做 loss 文案，直接顯示帶負號即可，避免與 stock_summary 的 loss 分支耦合。
function sanitizePe(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
}
```

變數改名 `pe → peTtm`、`pe4 → peEstimate` 是為了在程式碼層面就能看出語意（同時不誤稱 `本益比` 為 forward；它含 fallback 不是純預估），避免下個工程師再被舊名字誤導。

### Step 2 ─ `stock_summary.js` 估值文案改用近 4 季

```js
// js/modules/stock_summary.js:251

// 改前
const pe = quote?.["本益比"];

// 改後
const peRaw = Number(quote?.["本益比4"]);                          // 近 4 季，與 classifyValuation 閾值對齊
const pe = Number.isFinite(peRaw) && peRaw !== 0 ? peRaw : null;   // 只擋 0 與非有限值
```

注意 filter 條件刻意是 `!== 0` **而非 `> 0`** ─ 依 dottdot 契約「近 4 季稅後純益累計小於 0 不予計算」，理論上 API 會回 null（此處走「資料不足」分支）；但若 API 實際回傳負值，仍保留給 [classifyValuation:107-112](../../js/modules/stock_summary.js) 的 `< 0 → loss`（「PE 為負，代表近期獲利為負」）分支處理，否則 loss narrative 在 render 路徑會變成不可達。

`classifyValuation(pe)` 與後續 narrative 不動 ─ 拿到的值意義變了（從「當年預估」變成「近 4 季」），但分檔閾值（loss / 偏低 / 合理 / 偏高 / 明顯偏高）就是為近 4 季 PE 設計的，現在來源終於對了。

**不要 fallback 到 `本益比`**：若 `本益比4` 缺失，應走 `classifyValuation(null)` → 「估值資料不足」，而不是用預估值假裝有資料。

### Step 3 ─ 測試

#### `tests/stock_summary.test.js`

**修改 line 239 既有 fixture**：

```js
// 改前
本益比: 21.5,

// 改後
本益比4: 21.5,
```

只改欄位 key，數值維持 21.5。**這個 render 測試現況沒有 narrative 斷言**（只驗結構/chips/分數/dividend yield 等），所以本計畫要**新增**一條 narrative 斷言鎖住新的 PE 來源：

```js
assert.match(container.innerHTML, /估值偏高/);   // 21.5 落在 > 20 ~ 30 → 偏高
```

理由：把 fixture key 換掉是默默改 contract；如果不加斷言，未來有人改回 `本益比` 也不會被測試擋下。

**新增斷言（同檔案）**：

| 用例 | quote 內容 | 期望 |
|------|------|------|
| 1. 只有近 4 季欄位 | `本益比4: 15` | narrative 含「估值合理」（驗證來源已切到 `本益比4`，且 15 → fair）|
| 2. 兩個欄位都在 | `本益比: 5, 本益比4: 21.5` | narrative 含「估值偏高」（驗證用的是 21.5 而非 5）|
| 3. 反向缺漏（**新增的負面案例**）| `本益比: 8`（只有預估，無近 4 季）| narrative 含「估值資料不足」（驗證**不** fallback 到預估）|
| 4. 兩個都是 0 / 缺失 | `本益比: 0, 本益比4: 0` 或皆 null | narrative 含「估值資料不足」 |
| 5. 近 4 季為負 | `本益比4: -3` | narrative 含「PE 為負」（驗證負值不被 sanitizer 吃掉、loss 分支可達）|

#### `tests/profile.test.js`（**新檔，本計畫新增**）

不能只靠 preview 把標籤校正的契約鎖住，因為標籤對調是高風險變動。新增小型 regression：

| 用例 | quote 內容 | 期望 |
|------|------|------|
| 1. 兩欄都有值 | `本益比: 5, 本益比4: 21.5` | innerHTML 含「PE」卡片顯示 `21.5`、「PE(預估)」卡片顯示 `5.0`；**不再出現** `PE₄(預估)` 字串 |
| 2. 預估欄缺失 | `本益比: null, 本益比4: 18` | 「PE」顯示 `18.0`、「PE(預估)」顯示 `—` |
| 3. 近 4 季欄缺失 | `本益比: 12, 本益比4: null` | 「PE」顯示 `—`、「PE(預估)」顯示 `12.0` |
| 4. 0 視為無效 | `本益比: 0, 本益比4: 0` | 兩張卡片都顯示 `—`（驗證 `sanitizePe` 對 0 的 guard）|

**mock 策略**（兩種選一）：
- (a) 在 `tests/profile.test.js` 內**複製** `dom_smoke.test.js` 的 `withMockDocument({...})` pattern 為 local helper（不 import 跨檔案 helper，避免測試間耦合）
- (b) 把這幾個 PE 用例**直接加進** `dom_smoke.test.js` 既有的 mock document 區塊

兩種都不需 JSDOM、不需 fetch。

**斷言要綁定「同一張卡片」**，避免只用 `innerHTML.includes("PE")` 或 `includes("21.5")` 造成 false positive：

```js
// 解析 .metric-card 結構成 [{ label, value }, ...]
const cards = [...elements["profile-content"].innerHTML.matchAll(
  /<div class="metric-card">\s*<div class="metric-label">([^<]+)<\/div>\s*<div class="metric-value">([^<]+)<\/div>/g,
)].map((m) => ({ label: m[1].trim(), value: m[2].trim() }));

const peCard = cards.find((c) => c.label === "PE");
const peEstimateCard = cards.find((c) => c.label === "PE(預估)");
assert.equal(peCard?.value, "21.5");
assert.equal(peEstimateCard?.value, "5.0");
assert.equal(cards.find((c) => c.label.includes("PE₄")), undefined);  // 舊標籤完全消失
```

### Step 4 ─ 視覺驗收（preview）

**注意**：以下數值以 2026-05-05/06 抽樣為例；preview 當下請先確認 dottdot quote date 與 TWSE BWIBBU date 對齊，再對照數值。

搜尋 **2330**，預期：
- 「**PE**」卡片顯示**接近**證交所當日 PE（抽樣日約 34；數值會跟著市價變動）
- 「**PE(預估)**」卡片顯示 `本益比` 欄當前值（抽樣日約 22.7）
- 不再出現「PE₄(預估)」字樣
- 股票摘要估值文案：實作後預期 2330 從「估值偏高」（22.7）變成「**估值明顯偏高**」（34）

搜尋 **2882**：
- 「PE」與「PE(預估)」抽樣日均接近 11.5~11.7
- 估值文案應落在「估值合理」

## 四、相容性與風險

* **既有測試需小幅改 fixture + 新增斷言**：`tests/stock_summary.test.js:239` 把 `本益比` key 改成 `本益比4`；同一個 render 測試**新增** narrative 斷言（預期含「估值偏高」，因 21.5 落在 high 檔）；`stock_summary.test.js` 內其他 fixture 未引用 `本益比` / `本益比4`。`tests/data_verify.test.js` 多處有 `本益比4` 是用於資料比對流程的測試（與 UI 顯示無關），**本計畫不動**
* **PE 分檔閾值現在終於對齊語意**：[stock_summary.js:113-125](../../js/modules/stock_summary.js) 的閾值是給「近 4 季標準 PE」設計，現在來源換對之後分檔會更貼近市場直覺；既有 2330 narrative 會**從「估值偏高」變成「估值明顯偏高」** ─ 這**是修正而非退化**，但 PR review 時要主動說明預期變化
* **盤中 vs 盤後**：兩個欄位都來自同一個 quotes query 同一筆 row，cadence 完全一樣
* **`本益比` fallback 情境**：dottdot 註明無機構預估時會 fallback 為近 4 季累計；此時「PE」與「PE(預估)」兩欄會顯示相同數字。**這不是 bug 而是 dottdot 的契約行為**，但對讀者而言可能誤以為「市場與歷史一致」。本計畫先不在 UI 上顯式標示 fallback；後續若 dottdot 願意提供「是否使用機構預估」flag，可考慮在 PE(預估) 加 chip 提示
* **`0` 不再被當有效值；負值保留給 loss 顯示/敘事**：`sanitizePe()`（profile 卡片）與 `stock_summary.js` 內的 filter 都僅排除 `0` 與非有限值，**負值不擋**。dottdot 公式註明「近四季稅後純益累計 < 0 不予計算」，這類情境的返回值依契約應為 null（走「資料不足」）；但若 API 實際回負值，會落到 `classifyValuation` 的 `< 0 → loss` 分支顯示「PE 為負」narrative。`0` 在實務上代表「不予計算」或邊界異常，保險起見也排除
* **類股不適用**：dottdot 對 TWA00 / TWC00 / TWBXX 等類股的 PE 用「總市值 / 總盈餘」加總口徑（先找類股包含的個股、再用個股盈餘加總），且**取數來源**有時間斷點 ─ 2003 年起取機構估稅後純益（與個股同邏輯）、2002 年底以前取當年度第四季稅後純益累計。本頁面只支援個股查詢，本計畫不涵蓋類股；未來若要支援類股，PE(預估) 在 2002 年底前的歷史資料語意會跟個股口徑不同，需另外設計

## 五、後續 / Out of scope

- **Tooltip 文案**：兩個 PE 標籤旁可加 tooltip 說明計算方式（例如「PE = 收盤價 / 近 4 季稅後純益推算每股盈餘」「PE(預估) = 收盤價 / 機構預估年稅後純益推算每股盈餘（無預估時退回近 4 季累計）」）─ 等有 tooltip 框架時做，本計畫只校正主標籤
- **「機構預估成長」衍生指標**：PE(預估) / PE 的比值可衍生出「機構預估盈餘成長訊號」的 chip 或徽章，例如「比值 < 0.8 → 機構預估獲利顯著高於近 4 季」─ 但要排除 fallback 情境（兩欄相同 → 無預估資料），另一個 PR 評估
- **歷史比較**：dottdot 註明機構預估年稅後純益會月頻更新，可考慮在估值區塊加一條 PE(預估) 趨勢線 ─ 範疇較大，另案
