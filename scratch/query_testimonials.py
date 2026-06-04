import os
import json
import psycopg2

# Load .env
if os.path.exists(".env"):
    with open(".env") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT config FROM "CourseConfigCache" WHERE slug=\'amish-secrets\'')
row = cur.fetchone()
if row:
    cfg = json.loads(row[0])
    print("Top-level testimonials:", cfg.get("testimonials"))
    if "languages" in cfg:
        for lang in cfg["languages"]:
            if "testimonials" in cfg["languages"][lang]:
                print(f"{lang} testimonials:", cfg["languages"][lang].get("testimonials"))
else:
    print("No row found")
