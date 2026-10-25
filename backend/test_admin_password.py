
import os
from pathlib import Path
from dotenv import load_dotenv

# Load the .env file from the project root.
project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / ".env", override=True)

from auth import _verify_password

stored_hash = os.getenv("ADMIN_PASSWORD_HASH", "").strip()

print("Hash exists:", bool(stored_hash))
print("Hash format is PBKDF2-SHA256:", stored_hash.startswith("pbkdf2_sha256$"))

password = input("Enter the exact admin password you created: ")
print("Password matches stored hash:", _verify_password(password, stored_hash))
