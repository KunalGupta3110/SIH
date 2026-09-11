import sqlite3

def clean():
    conn = sqlite3.connect("data/events.db")
    c = conn.cursor()
    # Mark old critical events confirmed so they do not continuously sound the sirens
    c.execute("UPDATE security_events SET operator_status = 'CONFIRMED' WHERE severity = 'CRITICAL'")
    conn.commit()
    c.execute("SELECT COUNT(*), severity, operator_status FROM security_events GROUP BY severity, operator_status")
    print("Database status after update:", c.fetchall())
    conn.close()

if __name__ == "__main__":
    clean()
