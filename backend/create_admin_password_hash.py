"""Create a PBKDF2-SHA256 hash for ADMIN_PASSWORD_HASH in the .env file."""

import getpass
import hashlib
import secrets
import sys

ROUNDS = 600_000


def main() -> int:
    password = getpass.getpass("Create administrator password (input hidden): ")
    if len(password) < 12:
        print("Use at least 12 characters for the administrator password.", file=sys.stderr)
        return 1
    confirmation = getpass.getpass("Enter the same password again: ")
    if not secrets.compare_digest(password, confirmation):
        print("The passwords do not match. Run the script again.", file=sys.stderr)
        return 1

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ROUNDS, dklen=32)
    encoded = f"pbkdf2_sha256${ROUNDS}${salt.hex()}${digest.hex()}"
    print("\nCopy this hash into your .env file as ADMIN_PASSWORD_HASH=")
    print(encoded)
    print("\nDo not share the hash or your password. Keep the .env file out of GitHub.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
