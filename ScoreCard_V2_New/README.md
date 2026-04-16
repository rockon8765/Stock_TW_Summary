# ScoreCard_V2_New

This folder is tracked in the main `StockOnePage` repo as source only.

Tracked here:
- Python scripts used to build ScoreCard outputs and export `scorecard_web.json`
- `README.md`
- `.gitignore`

Ignored here:
- local credentials such as `myKey.json`
- raw market data, intermediate caches, and generated result tables
- large `csv` / `feather` / Office exports
- editor state and Python cache files

If strategy matrices or ScoreCard outputs change, regenerate `scorecard_web.json`
with `export_scorecard_to_web.py` and commit that file from the repo root.
