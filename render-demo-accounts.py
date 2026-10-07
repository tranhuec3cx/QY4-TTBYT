#!/usr/bin/env python3
import hashlib
import os
import secrets
import sqlite3

if os.environ.get("QY4_DEMO_ACCOUNTS", "0") != "1":
    print("QY4 demo account migration skipped")
    raise SystemExit(0)

DB_PATH = os.path.join("db", "qy4_ttbyt.sqlite")
if not os.path.exists(DB_PATH):
    raise SystemExit(f"Database not found: {DB_PATH}")

accounts = [
    ("admin", "admin", "Quản trị viên", "Quản trị viên", None, "QY4_DEMO_ADMIN_PASSWORD"),
    ("trangbi", "khoa_c10", "Khoa Trang bị", "Kỹ sư TTBYT", "C10", "QY4_DEMO_C10_PASSWORD"),
    ("khoa_a1", "khoa_a1", "Khoa A1", "Người dùng khoa", "A1", "QY4_DEMO_A1_PASSWORD"),
    ("khoa_a2", "khoa_a2", "Khoa A2", "Người dùng khoa", "A2", "QY4_DEMO_A2_PASSWORD"),
    ("khoa_c7", "khoa_c7", "Khoa C7", "Người dùng khoa", "C7", "QY4_DEMO_C7_PASSWORD"),
]

def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
        dklen=64,
    ).hex()

conn = sqlite3.connect(DB_PATH)
try:
    cur = conn.cursor()
    for old_username, new_username, full_name, role, department_code, password_env in accounts:
        password = os.environ.get(password_env, "")
        if not password:
            raise RuntimeError(f"Missing required environment variable: {password_env}")

        row = cur.execute(
            "SELECT id FROM users WHERE lower(username)=lower(?) LIMIT 1",
            (old_username,),
        ).fetchone()
        if not row and old_username.lower() != new_username.lower():
            row = cur.execute(
                "SELECT id FROM users WHERE lower(username)=lower(?) LIMIT 1",
                (new_username,),
            ).fetchone()

        salt = secrets.token_hex(16)
        pwd_hash = password_hash(password, salt)
        if row:
            cur.execute(
                """
                UPDATE users
                SET full_name=?, username=?, role=?, department_code=?, status='Hoạt động', phone='',
                    password_hash=?, password_salt=?
                WHERE id=?
                """,
                (full_name, new_username, role, department_code, pwd_hash, salt, row[0]),
            )
        else:
            cur.execute(
                """
                INSERT INTO users(full_name, username, role, department_code, status, phone, password_hash, password_salt)
                VALUES(?,?,?,?, 'Hoạt động', '', ?, ?)
                """,
                (full_name, new_username, role, department_code, pwd_hash, salt),
            )

    allowed = [a[1].lower() for a in accounts]
    placeholders = ",".join("?" for _ in allowed)
    cur.execute(
        f"UPDATE users SET status='Ngừng hoạt động' WHERE lower(username) NOT IN ({placeholders})",
        allowed,
    )
    cur.execute("DELETE FROM auth_sessions")
    conn.commit()

    count = cur.execute(
        "SELECT COUNT(*) FROM users WHERE status='Hoạt động'"
    ).fetchone()[0]
    integrity = cur.execute("PRAGMA quick_check").fetchone()[0]
    if count != 5 or integrity != "ok":
        raise RuntimeError(f"Account migration validation failed: active={count}, quick_check={integrity}")
    print("QY4 demo accounts synchronized: 5 active accounts; SQLite quick_check=ok")
finally:
    conn.close()
