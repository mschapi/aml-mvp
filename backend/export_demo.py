"""Export ONLY freshly generated synthetic data, never the local database."""
import json
from pathlib import Path
from domain import initial_data, CATALOG, BUSINESSES, STATES, TRANSITIONS

data = initial_data()
data.update(catalog=CATALOG, businesses=BUSINESSES, states=STATES, transitions=TRANSITIONS)
target = Path(__file__).parents[1] / 'frontend' / 'src' / 'demo-seed.json'
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Exported {len(data["transactions"])} synthetic transactions')
