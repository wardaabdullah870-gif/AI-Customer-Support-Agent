import getpass
import hashlib
import secrets
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent / ".env"

password = getpass.getpass("Enter new admin password (12+ characters): ")
if len(password) < 12:
    raise SystemExit("Password must be at least 12 characters.")

confirmation = getpass.getpass("Confirm admin password: ")
if not secrets.compare_digest(password, confirmation):
    raise SystemExit("Passwords do not match.")

salt = secrets.token_bytes(16)
rounds = 600_000
digest = hashlib.pbkdf2_hmac(
    "sha256", password.encode("utf-8"), salt, rounds, dklen=32
)
password_hash = f"pbkdf2_sha256${rounds}${salt.hex()}${digest.hex()}"

lines = env_path.read_text(encoding="utf-8").splitlines()
prefix = "ADMIN_PASSWORD_HASH="
matches = [i for i, line in enumerate(lines) if line.strip().startswith(prefix)]

if matches:
    lines[matches[0]] = prefix + password_hash
    for i in reversed(matches[1:]):
        lines.pop(i)
else:
    lines.append(prefix + password_hash)

env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("Password hash saved to the root .env file.")
print("Hash value:", bool(password_hash))