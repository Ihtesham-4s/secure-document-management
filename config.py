import os
import base64

SECRET_KEY = 'your-secret-key'  # Replace with a secure secret key
SESSION_TYPE = 'filesystem'
SESSION_PERMANENT = False
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
PERMANENT_SESSION_LIFETIME = 3600

DATABASE_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'venom',
    'database': 'dms'
}

# Generate a URL-safe base64-encoded Fernet key
def generate_key():
    key = os.urandom(32)
    return base64.urlsafe_b64encode(key)

ENCRYPTION_KEY = generate_key()

# Ensure the key is persisted across server restarts
KEY_FILE = 'encryption.key'
if not os.path.exists(KEY_FILE):
    with open(KEY_FILE, 'wb') as f:
        f.write(ENCRYPTION_KEY)
else:
    with open(KEY_FILE, 'rb') as f:
        ENCRYPTION_KEY = f.read()
