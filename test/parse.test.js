// node test/parse.test.js
// 從 index.html 抽取 PURE-START ~ PURE-END 純函式區，做解析器與縣市判斷的單元測試。
"use strict";
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/PURE-START[^\n]*\*\/\n([\s\S]*?)\n\/\*[^\n]*PURE-END/);
if (!m){ console.error("找不到 PURE 區塊，檢查 index.html 的標記註解"); process.exit(1); }
const { extractPlate, extractAddress, matchViolation, detectCounty, countyFromCoords, fmtSmsNum, reportText } =
  new Function(m[1] + `
    return { extractPlate, extractAddress, matchViolation, detectCounty, countyFromCoords, fmtSmsNum, reportText };`)();

let pass = 0, fail = 0;
function eq(name, got, want){
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.error(`✗ ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
}

/* ---- extractPlate：基本格式 ---- */
eq("車牌：空格分隔", extractPlate("車牌 ABC 1234 汽車併排"), "ABC-1234");
eq("車牌：小寫帶dash", extractPlate("abc-5678 停在人行道上"), "ABC-5678");
eq("車牌：舊式數字在前", extractPlate("9527 BH 紅線"), "9527-BH");
eq("車牌：全形", extractPlate("車牌ＸＹＺ０９８７"), "XYZ-0987");
eq("車牌：無車牌", extractPlate("沒有任何有用資訊"), null);
eq("車牌：機車騎士不誤抓", extractPlate("機車騎士你好"), null);
eq("車牌：地址不誤抓", extractPlate("和平東路二段96號 機車格被占用"), null);

/* ---- extractPlate：同音字/中文數字正規化 ---- */
eq("車牌：同音字母", extractPlate("欸必西1234"), "ABC-1234");
eq("車牌：中文數字", extractPlate("ABC一二三四"), "ABC-1234");
eq("車牌：同音+中文數字", extractPlate("車牌是逼恩雞五六七八"), "BNG-5678");
eq("車牌：打不溜", extractPlate("打不溜歪批5678"), "WYP-5678");
eq("車牌：軍式唸法", extractPlate("MKZ洞拐幺三"), "MKZ-0713");

/* ---- matchViolation ---- */
eq("違規：併排", matchViolation("那台車併排在路邊"), "併排停車");
eq("違規：機車格優先於路口", matchViolation("路口的機車格被占"), "占用機車停車格");
eq("違規：交岔路口", matchViolation("停在交岔路口"), "於交岔路口違規停車");
eq("違規：黃線併入紅線", matchViolation("黃線停車"), "紅線違規停車，阻礙車流");
eq("違規：無", matchViolation("你好"), null);

/* ---- extractAddress ---- */
eq("地址：段+號補「前」", extractAddress("和平東路二段96號 機車格被占"), "和平東路二段96號前");
eq("地址：巷", extractAddress("MKZ-0713 忠孝東路三段217巷 擋出入口"), "忠孝東路三段217巷");
eq("地址：路名無門牌", extractAddress("光復南路 公車站前違停"), "光復南路");
eq("地址：一般詞不誤抓", extractAddress("停在交岔路口"), null);
eq("地址：太短不採信", extractAddress("馬路上有車"), null);
eq("地址：剝掉開頭動詞", extractAddress("停在光復南路96號"), "光復南路96號前");
eq("地址：違停在+段", extractAddress("違停在中山北路二段"), "中山北路二段");

/* ---- detectCounty（Nominatim 線上反查） ---- */
eq("縣市：直轄市", detectCounty({ city: "臺北市" }, ""), "臺北市");
eq("縣市：縣轄市走county", detectCounty({ city: "竹北市", county: "新竹縣" }, ""), "新竹縣");
eq("縣市：俗寫台", detectCounty({ city: "台中市" }, ""), "臺中市");
eq("縣市：嘉義縣市區分", detectCounty({ city: "太保市", county: "嘉義縣" }, ""), "嘉義縣");
eq("縣市：display_name兜底", detectCounty({}, "XX路, 苗栗市, 苗栗縣, 臺灣"), "苗栗縣");
eq("縣市：國外", detectCounty({ city: "Tokyo" }, "Tokyo, Japan"), null);

/* ---- countyFromCoords（離線最近點） ---- */
eq("座標：台北車站", countyFromCoords(25.0478, 121.5170), "臺北市");
eq("座標：板橋", countyFromCoords(25.0130, 121.4630), "新北市");
eq("座標：高雄85大樓", countyFromCoords(22.6119, 120.3003), "高雄市");
eq("座標：新竹市東區", countyFromCoords(24.8016, 120.9714), "新竹市");
eq("座標：竹北", countyFromCoords(24.8397, 121.0043), "新竹縣");
eq("座標：嘉義市", countyFromCoords(23.4801, 120.4491), "嘉義市");
eq("座標：馬公", countyFromCoords(23.5654, 119.5793), "澎湖縣");
eq("座標：東京=國外", countyFromCoords(35.68, 139.69), null);

/* ---- fmtSmsNum / reportText ---- */
eq("號碼格式化", fmtSmsNum("0911510914"), "0911-510-914");
eq("號碼：非10碼原樣", fmtSmsNum("110"), "110");
const rt = reportText(new Date(2026, 6, 19, 14, 5), "X路1號前", "ABC-1234", "自小客車", "併排停車", "");
eq("範本含日期時間", rt.includes("2026/07/19 14:05"), true);
eq("範本含車牌車種", rt.includes("ABC-1234（自小客車）"), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
