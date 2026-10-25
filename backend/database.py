
import sqlite3
from pathlib import Path
from uuid import uuid4

DATABASE_PATH = Path(__file__).parent / "orders.db"


def initialize_database():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                order_number TEXT PRIMARY KEY,
                customer_email TEXT NOT NULL,
                product_name TEXT NOT NULL,
                status TEXT NOT NULL,
                estimated_delivery TEXT
            )
            """
        )

        connection.executemany(
            """
            INSERT OR IGNORE INTO orders
            (order_number, customer_email, product_name, status, estimated_delivery)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    "ORD1001",
                    "customer1@example.com",
                    "Wireless Headphones",
                    "Processing",
                    "2026-10-23",
                ),
                (
                    "ORD1002",
                    "customer2@example.com",
                    "Laptop Stand",
                    "Shipped",
                    "2026-10-22",
                ),
                (
                    "ORD1003",
                    "customer3@example.com",
                    "Keyboard",
                    "Delivered",
                    "2026-10-18",
                ),
            ],
        )

        # Store customer complaints and return requests.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS support_requests (
                request_id TEXT PRIMARY KEY,
                customer_email TEXT NOT NULL,
                order_number TEXT,
                request_type TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Open',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def find_order(order_number: str, customer_email: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row

        order = connection.execute(
            """
            SELECT order_number, product_name, status, estimated_delivery
            FROM orders
            WHERE order_number = ? AND customer_email = ?
            """,
            (order_number, customer_email.strip().lower()),
        ).fetchone()

        return dict(order) if order else None


def create_support_request(
    customer_email: str,
    request_type: str,
    description: str,
    order_number: str | None = None,
):
    request_id = "REQ-" + uuid4().hex[:8].upper()

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT INTO support_requests
            (request_id, customer_email, order_number, request_type, description)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                request_id,
                customer_email.strip().lower(),
                order_number.strip().upper() if order_number else None,
                request_type,
                description.strip(),
            ),
        )

    return {
        "request_id": request_id,
        "status": "Open",
        "request_type": request_type,
    }


def get_all_support_requests():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row

        requests = connection.execute(
            """
            SELECT
                request_id,
                customer_email,
                order_number,
                request_type,
                description,
                status,
                created_at
            FROM support_requests
            ORDER BY created_at DESC
            """
        ).fetchall()

        return [dict(request) for request in requests]


def update_support_request_status(request_id: str, status: str):
    with sqlite3.connect(DATABASE_PATH) as connection:
        cursor = connection.execute(
            """
            UPDATE support_requests
            SET status = ?
            WHERE request_id = ?
            """,
            (status, request_id),
        )

        return cursor.rowcount > 0
