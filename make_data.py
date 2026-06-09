# -*- coding: utf-8 -*-
"""Generate all JSON data for the China & International Order website (static, client-side).

Reads the validated LLM-coded corpus + audience/domain tags + external series and writes compact
JSON into ./data/. Re-run whenever the analysis updates. Descriptive only — no causal labelling.
"""
import json, re
from pathlib import Path
import pandas as pd, numpy as np

PROJ = Path("/Users/jamiegruffydd-jones/Documents/Documents - Jamie MacBook Air/Projects/International order")
CLS  = PROJ/"data/classified"; EXT = PROJ/"data/external"
OUT  = PROJ/"websites/chinaio/data"; OUT.mkdir(parents=True, exist_ok=True)
def dump(name, obj, minify=True):
    fp = OUT/name
    fp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",",":") if minify else None,
                             indent=None if minify else 2), encoding="utf-8")
    print(f"wrote {name}  ({fp.stat().st_size/1024:.0f} KB)")

STANCES = ["Defend","Defend-and-Reform","Reform","Revisionist","Accusatory"]

# ---------- load + merge ----------
m   = pd.read_csv(CLS/"2026-06-03_guojizhixu_exact-phrase_llm-coded.csv", dtype=str).drop_duplicates("id")
aud = pd.read_csv(CLS/"2026-06-06_audience_tags.csv", dtype=str).drop_duplicates("id")[["id","audience"]]
dom = pd.read_csv(CLS/"2026-06-06_guojizhixu_johnston-domains-llm.csv", dtype=str).drop_duplicates("id")[["id","llm_domain"]]
df  = m.merge(aud, on="id", how="left").merge(dom, on="id", how="left")
df["dt"]   = pd.to_datetime(df["date"], errors="coerce")
df["year"] = df["dt"].dt.year
df = df[df["year"].notna()]; df["year"] = df["year"].astype(int)

def clip(s, n):
    s = "" if pd.isna(s) else str(s).strip()
    return s if len(s) <= n else s[:n].rstrip()+"…"

# ---------- 1. article explorer corpus ----------
# optional English translations (from the Haiku batch; merged when present)
TRANSL = CLS/"2026-06-09_guojizhixu_translations.csv"
tr = {}
if TRANSL.exists():
    _td = pd.read_csv(TRANSL, dtype=str).fillna("")
    tr = {row["id"]: (row.get("h_en",""), row.get("q_en","")) for _,row in _td.iterrows()}
    print(f"  merged {sum(1 for v in tr.values() if v[0] or v[1])} English translations")

recs = []
for _, r in df.iterrows():
    rec = {
        "id": r["id"],
        "y": int(r["year"]),
        "d": (r["dt"].strftime("%Y-%m-%d") if pd.notna(r["dt"]) else ""),
        "h": clip(r.get("headline"), 80),
        "s": r["llm_stance"] if r["llm_stance"] in STANCES else "Other",
        "a": r.get("audience") if pd.notna(r.get("audience")) else "—",
        "dm": r.get("llm_domain") if pd.notna(r.get("llm_domain")) else "—",
        "t": clip(r.get("llm_tone"), 14),
        "v": (None if pd.isna(r.get("llm_valence")) else round(float(r["llm_valence"]))),
        "sec": clip(r.get("section"), 10),
        "q": clip(r.get("llm_quote"), 130),       # the driving 国际秩序 sentence
        "r": clip(r.get("llm_rationale"), 200),    # LLM's English reasoning
        "u": r.get("url") if pd.notna(r.get("url")) else "",
    }
    he, qe = tr.get(r["id"], ("", ""))
    if he: rec["he"] = clip(he, 160)   # English headline
    if qe: rec["qe"] = clip(qe, 320)   # English quote
    recs.append(rec)

# English-language sources, appended with a `src` tag (already in English).
EN_SOURCES = [
    ("People's Daily English", CLS/"2026-06-08_english-pd_llm-coded.csv"),
    ("China Daily",            CLS/"2026-06-08_chinadaily_llm-coded.csv"),
]
for srclabel, path in EN_SOURCES:
    if not path.exists():
        print(f"  (skipped {srclabel}: file missing)"); continue
    ed = pd.read_csv(path, dtype=str); ed["dt"] = pd.to_datetime(ed["date"], errors="coerce")
    ed = ed[ed["dt"].notna()]
    n0 = len(recs)
    for _, r in ed.iterrows():
        st = r.get("llm_stance")
        val = r.get("llm_valence")
        try: v = round(float(val)) if val not in (None, "", "nan") and pd.notna(val) else None
        except Exception: v = None
        recs.append({
            "id": f"en_{r['id']}", "src": srclabel,
            "y": int(r["dt"].year), "d": r["dt"].strftime("%Y-%m-%d"),
            "h": clip(r.get("title"), 110),
            "s": st if st in STANCES else "Other",
            "a": "—", "dm": "—",
            "t": clip(r.get("llm_tone"), 14), "v": v,
            "sec": clip(r.get("section"), 10),
            "q": clip(r.get("llm_quote"), 200),
            "r": clip(r.get("llm_rationale"), 200),
            "u": r.get("url") if pd.notna(r.get("url")) else "",
        })
    print(f"  appended {len(recs)-n0} {srclabel} articles")

recs.sort(key=lambda x: x["d"], reverse=True)
dump("articles.json", recs)

# ---------- 2. stance by year (LLM, 5 categories + other) ----------
g = df.groupby(["year","llm_stance"]).size().unstack(fill_value=0)
for s in STANCES:
    if s not in g.columns: g[s] = 0
g["Other"] = g.drop(columns=[c for c in STANCES if c in g.columns]).sum(axis=1)
g["total"] = g[STANCES+["Other"]].sum(axis=1)
sby = [{"year":int(y), **{s:int(row[s]) for s in STANCES}, "Other":int(row["Other"]), "total":int(row["total"])}
       for y,row in g.iterrows()]
dump("stance_by_year.json", sby)

# ---------- 2b. stance by calendar month (seasonality, all years pooled) ----------
df["_month"] = df["dt"].dt.month
gm = df[df["_month"].notna()].groupby(["_month","llm_stance"]).size().unstack(fill_value=0)
for s in STANCES:
    if s not in gm.columns: gm[s] = 0
gm["Other"] = gm.drop(columns=[c for c in STANCES if c in gm.columns]).sum(axis=1)
sbm = [{"month":int(mo), **{s:int(row[s]) for s in STANCES}, "Other":int(row["Other"]),
        "total":int(row[STANCES+["Other"]].sum())} for mo,row in gm.iterrows()]
dump("stance_by_month.json", sbm)

# ---------- 3. stance by audience (+ Russia pre/post 2022) ----------
AUD_ORDER = ["Global South minilaterals","UN / multilateral system","Russia","Other bilateral",
             "Domestic (Party/governance)","Western allies","Great-power theory","Taiwan / sovereignty",
             "United States","Pandemic multilateralism","General (unspecified)"]
sig = df[df["llm_stance"].isin(STANCES)]
arows = []
for a, sub in sig.groupby("audience"):
    if len(sub) < 30: continue
    c = sub["llm_stance"].value_counts()
    arows.append({"audience":a, "n":int(len(sub)), **{s:int(c.get(s,0)) for s in STANCES}})
arows.sort(key=lambda r: AUD_ORDER.index(r["audience"]) if r["audience"] in AUD_ORDER else 99)
# Russia across the 2022 invasion (descriptive)
ru = sig[sig["audience"]=="Russia"]
def share(sub,s): return round((sub["llm_stance"]==s).mean()*100,1) if len(sub) else None
russia_ukraine = {p: {"n":int(len(s)), **{st:share(s,st) for st in STANCES}}
                  for p,s in [("pre-2022",ru[ru.year<2022]),("2022+",ru[ru.year>=2022])]}
dump("audience_stance.json", {"by_audience":arows, "russia_ukraine":russia_ukraine})

# ---------- 4. US isolation at the UN + China IO volume (descriptive context) ----------
ua = pd.read_csv(EXT/"us_un_alienation.csv")
vol = df.groupby("year").size()
us = [{"year":int(r["year"]), "alienation":round(float(r["world_mean_dist_from_us"]),3),
       "reliable":bool(r["reliable"]), "io_articles":int(vol.get(int(r["year"]),0))}
      for _,r in ua.iterrows() if r["year"]>=1990]
dump("us_alienation.json", us)

# ---------- 4b. context covariates (tabbed: order-talk volume vs continuous series) ----------
CYRS = list(range(1990, int(df.year.max())+1))
volume = [int(vol.get(y,0)) for y in CYRS]
def pearson(xs, ys):
    pairs = [(x,y) for x,y in zip(xs,ys) if x is not None and y is not None]
    if len(pairs) < 4: return None, len(pairs)
    a = np.array([p[0] for p in pairs], float); b = np.array([p[1] for p in pairs], float)
    if a.std()==0 or b.std()==0: return None, len(pairs)
    return round(float(np.corrcoef(a,b)[0,1]),2), len(pairs)

# UN isolation (reliable-year correlation only)
ua_m = {int(r["year"]): (round(float(r["world_mean_dist_from_us"]),3), bool(r["reliable"])) for _,r in ua.iterrows()}
un_series   = [ua_m[y][0] if y in ua_m else None for y in CYRS]
un_reliable = [ua_m[y][1] if y in ua_m else False for y in CYRS]
un_r, un_n  = pearson([volume[i] if un_reliable[i] else None for i in range(len(CYRS))], un_series)

# GDELT US–China conflict share (annual, event-weighted)
gd = pd.read_csv(EXT/"gdelt_uschina_monthly.csv"); gd["y"] = pd.to_datetime(gd["month"], errors="coerce").dt.year
gann = gd.groupby("y").apply(lambda d:(d["pct_conflict"]*d["n_events"]).sum()/d["n_events"].sum())
gd_series = [round(float(gann.get(y))*100,1) if y in gann.index else None for y in CYRS]
gd_r, gd_n = pearson(volume, gd_series)

# Relative power: China GDP ÷ US GDP (%)
pw = pd.read_csv(EXT/"2026-06-04_power_covariates.csv").set_index("year")
gdp_series = [round(float(pw["gdp_ratio_pct"].get(y)),1) if y in pw.index else None for y in CYRS]
gdp_r, gdp_n = pearson(volume, gdp_series)

# US tariffs on Chinese goods (annual mean)
tt = pd.read_csv(EXT/"piie_tariffs_monthly.csv"); tt["y"] = pd.to_datetime(tt["ym"], errors="coerce").dt.year
tann = tt.groupby("y")["us_on_china"].mean()
tar_series = [round(float(tann.get(y)),1) if y in tann.index else None for y in CYRS]
tar_r, tar_n = pearson(volume, tar_series)

context_out = {
  "years": CYRS, "volume": volume,
  "covariates": [
    {"key":"un", "label":"US isolation at the UN", "short":"US isolation · UN",
     "axis":"World distance from US (isolation)", "series":un_series, "reliable":un_reliable, "r":un_r, "n":un_n,
     "note":"US isolation at the UN — the world-mean ideal-point distance of UN members from the US in roll-call votes (Voeten UN-voting data). Higher = the US more isolated. Hollow points mark thin vote-years (few US roll-calls) and are excluded from the correlation."},
    {"key":"gdelt", "label":"China–US confrontation (GDELT)", "short":"Confrontation · GDELT",
     "axis":"Conflict share of US–China events (%)", "series":gd_series, "r":gd_r, "n":gd_n,
     "note":"Share of US–China interaction events coded conflictual in GDELT (the Global Database of Events, Language &amp; Tone), annual mean weighted by event volume. Higher = more confrontation. Machine-coded from world news; descriptive."},
    {"key":"power", "label":"China's relative power (GDP)", "short":"Relative power · GDP",
     "axis":"China GDP ÷ US GDP (%)", "series":gdp_series, "r":gdp_r, "n":gdp_n,
     "note":"China's GDP as a percentage of US GDP (World Bank, current US$). A structural covariate — both this and order-talk volume rise over the period, so the correlation largely reflects a shared upward trend."},
    {"key":"tariff", "label":"US tariffs on Chinese goods", "short":"US tariffs",
     "axis":"Average US tariff on Chinese goods (%)", "series":tar_series, "r":tar_r, "n":tar_n,
     "note":"Average US tariff rate on imports from China (PIIE / Chad Bown's US–China tariff tracker), annual mean. Steps up with the 2018– trade war and again sharply in 2025."},
  ],
}
dump("context.json", context_out)

# ---------- 5. revisionism over time (collapse + where it lived) ----------
def era(y): return "pre-2005" if y<2005 else "2005–12" if y<2013 else "2013–17" if y<2018 else "2018+"
sig2 = sig.copy(); sig2["era"] = sig2.year.map(era)
rev_era = [{"era":e, "rev_pct":round((sig2[sig2.era==e]["llm_stance"]=="Revisionist").mean()*100,1),
            "n":int((sig2.era==e).sum())} for e in ["pre-2005","2005–12","2013–17","2018+"]]
prerev = sig2[(sig2.year<2013)&(sig2.llm_stance=="Revisionist")]
geo = (prerev["audience"].value_counts(normalize=True)*100).round(0)
rev_geo = [{"audience":a,"pct":int(p)} for a,p in geo.items()]
dump("revisionism.json", {"by_era":rev_era, "pre2013_geography":rev_geo, "n_pre2013":int(len(prerev))})

# ---------- 6. word vs deed (descriptive: parallel-building deeds vs revisionist words) ----------
order = pd.read_csv(EXT/"behavioural_indicators_order.csv").set_index("year")
# Individual behaviour components that make up the aggregate parallel-building index.
COMPONENTS = {
  "cips_participants":   "CIPS payment participants",
  "rmb_swift_share_pct": "RMB share of SWIFT payments (%)",
  "ndb_lending_cum_bn":  "NDB cumulative lending ($bn)",
  "brics_members":       "BRICS member states",
}
def norm01(c): c=c.astype(float); return (c-c.min())/(c.max()-c.min())
comp_norm = {k: norm01(order[k]) for k in COMPONENTS}                 # each 0–1
par = pd.concat(comp_norm, axis=1).mean(axis=1) * 100                 # aggregate 0–100
revshare = sig.groupby("year").apply(lambda d:(d["llm_stance"]=="Revisionist").mean()*100)
def at(s, y, nd=1):
    return round(float(s.get(y)), nd) if y in s.index else None
wd = {
  "components": [{"key":k, "label":v} for k,v in COMPONENTS.items()],
  "series": [{
     "year": int(y),
     "parallel_build":  at(par, y),
     "revisionist_pct": at(revshare, y),
     # normalised 0–100 (so every component shares one left axis)
     **{k: (round(float(comp_norm[k].get(y))*100,1) if y in order.index else None) for k in COMPONENTS},
     # raw values for the tooltip
     **{k+"_raw": at(order[k], y, 2) for k in COMPONENTS},
  } for y in range(2000,2026)]
}
dump("word_deed.json", wd)

# ---------- 7. UNGA (international audience) — analyst-coded summary, descriptive ----------
unga = {
  "summary": "In 16 consecutive UN General Assembly general-debate statements (2010–2025), China's order language is Defend-and-Reform every year, with no overt call to replace the order.",
  "years": [
    {"y":2015,"speaker":"Xi Jinping","quote":"We should uphold the international order and system underpinned by the purposes and principles of the UN Charter."},
    {"y":2021,"speaker":"Xi Jinping","quote":"There is only one international system, the international system with the UN at its core."},
    {"y":2022,"speaker":"Wang Yi","quote":"China has always been a defender of the international order."},
    {"y":2025,"speaker":"Li Qiang","quote":"China firmly upholds the existing international order and stands for greater representation of developing countries."},
  ],
  "pd_revisionist_mean": round((sig[(sig.year>=2010)&(sig.year<=2025)]["llm_stance"]=="Revisionist").mean()*100,1),
}
dump("unga.json", unga)

# ---------- 8. site stats (data-driven hero + about) ----------
# most common (modal) stance among signalled articles since 2013
_modal2013 = sig[sig.year>=2013]["llm_stance"].value_counts()
# combined Accusatory share toward the West (US + Western allies)
_west = [r for r in arows if r["audience"] in ("United States","Western allies")]
stats = {
  "n_articles": int(len(df)),
  "year_min": int(df.year.min()), "year_max": int(df.year.max()),
  "updated": "2026-06-06",
  "stance_totals": {s:int((df["llm_stance"]==s).sum()) for s in STANCES},
  "us_accusatory_pct": next((round(r["Accusatory"]/r["n"]*100) for r in arows if r["audience"]=="United States"), None),
  "gs_accusatory_pct": next((round(r["Accusatory"]/r["n"]*100) for r in arows if r["audience"]=="Global South minilaterals"), None),
  "gs_reform_pct": next((round((r["Reform"]+r["Defend-and-Reform"])/r["n"]*100) for r in arows if r["audience"]=="Global South minilaterals"), None),
  "rev_pre2005": rev_era[0]["rev_pct"], "rev_2018plus": rev_era[3]["rev_pct"],
  "modal_stance_since2013": (_modal2013.index[0] if len(_modal2013) else None),
  "modal_stance_since2013_pct": (round(_modal2013.iloc[0]/_modal2013.sum()*100) if len(_modal2013) else None),
  "west_accusatory_pct": (round(sum(r["Accusatory"] for r in _west)/sum(r["n"] for r in _west)*100) if _west else None),
}
dump("stats.json", stats)

# ---------- 9. key-term frequencies (combined, selectable) ----------
TERMS_XLSX = PROJ/"data/raw-extracts/PD terms.xlsx"
CSF_XLSX   = PROJ/"data/raw-extracts/PD 人类命运共同体.xlsx"
def yc(dates):
    y = pd.to_datetime(dates, errors="coerce").dt.year.dropna().astype(int)
    return y.value_counts().sort_index()
TERM_DEFS = [
  ("io",   "国际秩序",        "International order"),
  ("csf",  "人类命运共同体",  "Community of shared future"),
  ("ntr",  "新型国际关系",    "New type of international relations"),
  ("gc",   "百年未有之大变局","Great changes unseen in a century"),
  ("pwo",  "战后国际秩序",    "Post-war international order"),
  ("isys", "国际体系",        "International system"),
]
xt = pd.ExcelFile(TERMS_XLSX)
counts = {
  "io":   df.groupby("year").size(),                              # the coded corpus = 国际秩序 freq
  "csf":  yc(pd.read_excel(CSF_XLSX)["date"]),
  "ntr":  yc(xt.parse("新型国际关系")["date"]),
  "gc":   yc(xt.parse("百年未有之大变局")["date"]),
  "pwo":  yc(xt.parse("战后国际秩序")["date"]),
  "isys": yc(xt.parse("国际体系")["date"]),
}
YMIN, YMAX = 1990, int(df.year.max())
terms_out = {
  "terms": [{"key":k, "zh":zh, "en":en, "total": int(counts[k].sum())} for k,zh,en in TERM_DEFS],
  "years": list(range(YMIN, YMAX+1)),
  "series": {k: [{"year":y, "n":int(counts[k].get(y,0))} for y in range(YMIN,YMAX+1)] for k,_,_ in TERM_DEFS},
}
dump("terms.json", terms_out)

# ---------- 10. UNGA: China cross-national + domestic comparison ----------
ung = pd.read_csv(CLS/"2026-06-06_ungdc_stance_llm.csv", dtype=str)
ung["year"] = pd.to_numeric(ung["year"], errors="coerce")
ung = ung[ung["llm_stance"].isin(STANCES)].dropna(subset=["year"])
def sdist(sub):
    return {s: round((sub["llm_stance"]==s).mean()*100,1) for s in STANCES} if len(sub) else {s:0 for s in STANCES}
chn = ung[ung["country"]=="CHN"]
pd_sig = sig  # People's Daily, signalled stances (domestic framing)
chn2 = chn.copy(); chn2["dec"] = (chn2["year"]//10*10).astype(int)
china_decade = [{"decade":f"{int(d)}s", "n":int(len(sub)), **sdist(sub)}
                for d,sub in chn2.groupby("dec")]
ungdc_out = {
  "china_dist": sdist(chn),
  "world_dist": sdist(ung),
  "pd_dist":    {s: round((pd_sig["llm_stance"]==s).mean()*100,1) for s in STANCES},
  "china_decade": china_decade,
  "n_china": int(len(chn)), "n_world": int(len(ung)), "n_world_countries": int(ung["country"].nunique()),
  "n_pd": int(len(pd_sig)),
  "year_min": int(chn["year"].min()), "year_max": int(chn["year"].max()),
  "china_rev_years": sorted(int(y) for y in chn[chn["llm_stance"]=="Revisionist"]["year"].unique()),
}
dump("ungdc.json", ungdc_out)

# ---------- 11. English-language outlets vs Chinese (audience/language) ----------
en_pd = pd.read_csv(CLS/"2026-06-08_english-pd_llm-coded.csv", dtype=str)
cd    = pd.read_csv(CLS/"2026-06-08_chinadaily_llm-coded.csv", dtype=str)
for d_ in (en_pd, cd):
    d_["year"] = pd.to_datetime(d_["date"], errors="coerce").dt.year
def comp(d_):
    s = d_[d_["llm_stance"].isin(STANCES)]
    return {st: round((s["llm_stance"]==st).mean()*100,1) for st in STANCES} if len(s) else {}
def by_year(d_, years):
    s = d_[d_["llm_stance"].isin(STANCES)]
    out = []
    for y in years:
        sub = s[s["year"]==y]
        out.append({"year": int(y), "n": int(len(sub)),
                    **{st: (round((sub["llm_stance"]==st).mean()*100,1) if len(sub) else None) for st in STANCES}})
    return out
YRS = list(range(2001, int(df.year.max())+1))   # China Daily starts 2001; PD English (2014+) is null before then
english_out = {
  "sources": [
    {"key":"pd_zh", "label":"People's Daily (Chinese)", "n": int(len(pd_sig))},
    {"key":"pd_en", "label":"People's Daily English",   "n": int(en_pd["llm_stance"].isin(STANCES).sum())},
    {"key":"cd",    "label":"China Daily",              "n": int(cd["llm_stance"].isin(STANCES).sum())},
  ],
  "dist": {
    "pd_zh": {st: round((pd_sig["llm_stance"]==st).mean()*100,1) for st in STANCES},
    "pd_en": comp(en_pd), "cd": comp(cd), "unga": sdist(chn),
  },
  "by_year": {
    "pd_zh": by_year(sig.assign(year=sig["year"]), YRS),
    "pd_en": by_year(en_pd, YRS), "cd": by_year(cd, YRS),
  },
}
# a few illustrative English quotes (highest-confidence, non-empty quote, per source×key stance)
def pick(lbl, d_, stance, k=1):
    s = d_[(d_["llm_stance"]==stance) & d_["llm_quote"].notna() & (d_["llm_quote"].astype(str).str.len()>30)
           & (d_["year"].notna())]
    s = s.sort_values("year", ascending=False).head(k)
    return [{"src": lbl, "y": int(r["year"]), "stance": stance, "title": clip(r.get("title"),100),
             "quote": clip(r.get("llm_quote"),240)} for _,r in s.iterrows()]
QSRC = [("China Daily", cd), ("People's Daily English", en_pd)]
quotes = []
for lbl, d_ in QSRC:
    for stance in ["Accusatory","Defend"]:
        quotes += pick(lbl, d_, stance, 1)
english_out["quotes"] = quotes
dump("english.json", english_out)

print("\nDONE — site data written to", OUT)
