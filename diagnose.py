"""
Diagnose the internal server error:
1. Check what the ads status values look like in the DB
2. Check if the Enum can deserialize them
3. Check if the users table has the right role values
"""
import sqlite3

DB = r'd:\AIO\Marketing AI\Health_Care_Agentic\backend\marketing_platform.db'
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

print("=== RAW ADVERTISEMENT STATUS VALUES ===")
ads = conn.execute("SELECT id, title, status FROM advertisements").fetchall()
for a in ads:
    print(f"  '{a['status']}' — {a['title']}")

print("\n=== RAW USER ROLE VALUES ===")
users = conn.execute("SELECT email, role FROM users").fetchall()
for u in users:
    print(f"  '{u['role']}' — {u['email']}")

print("\n=== AdStatus enum values (expected in DB) ===")
import sys
sys.path.insert(0, r'd:\AIO\Marketing AI\Health_Care_Agentic\backend')
from app.models.base import AdStatus, UserRole
for s in AdStatus:
    print(f"  name={s.name!r}  value={s.value!r}")

print("\n=== UserRole enum values (expected in DB) ===")
for r in UserRole:
    print(f"  name={r.name!r}  value={r.value!r}")

print("\n=== STATUS MATCH CHECK ===")
for a in ads:
    raw = a['status']
    # SQLAlchemy Enum stores by name for native enums
    by_name  = raw in [s.name  for s in AdStatus]
    by_value = raw in [s.value for s in AdStatus]
    print(f"  '{raw}' → by_name={by_name} by_value={by_value}")

print("\n=== ROLE MATCH CHECK ===")
for u in users:
    raw = u['role']
    by_name  = raw in [r.name  for r in UserRole]
    by_value = raw in [r.value for r in UserRole]
    print(f"  '{raw}' → by_name={by_name} by_value={by_value}")

conn.close()
