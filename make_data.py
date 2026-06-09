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
recs = []
for _, r in df.iterrows():
    recs.append({
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
    })
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
print("\nDONE — site data written to", OUT)
