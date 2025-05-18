import os
from flask import Flask, session, request, jsonify, send_from_directory, render_template, make_response, abort
from flask_session import Session
from werkzeug.utils import secure_filename
import jwt
from datetime import datetime, timedelta
import bcrypt
from functools import wraps
import mysql.connector
from config import DATABASE_CONFIG
from flask_cors import CORS
import traceback
from cryptography.fernet import Fernet, InvalidToken
from config import ENCRYPTION_KEY

app = Flask(__name__, static_folder='frontend', static_url_path='')
app.config.from_pyfile('config.py')
Session(app)
CORS(app, resources={
    r"/*": {
        "origins": ["http://127.0.0.1:8080", "http://localhost:8080"],
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# AES encryption key (must be 16, 24, or 32 bytes long)
AES_KEY = os.urandom(32)  # Securely generate a random key

def generate_fernet_key():
    """Create or retrieve the Fernet instance with the encryption key."""
    if not hasattr(generate_fernet_key, 'fernet'):
        try:
            generate_fernet_key.fernet = Fernet(ENCRYPTION_KEY)
        except Exception as e:
            print(f"Error initializing Fernet: {e}")
            raise
    return generate_fernet_key.fernet

def encrypt_file(file_data):
    """Encrypt file data using Fernet."""
    try:
        if not isinstance(file_data, bytes):
            raise ValueError("Input must be bytes")
            
        fernet = generate_fernet_key()
        return fernet.encrypt(file_data)
    except Exception as e:
        print(f"Encryption error: {e}")
        traceback.print_exc()
        raise

def decrypt_file(encrypted_data):
    """Decrypt file data using Fernet."""
    try:
        if not encrypted_data:
            raise ValueError("No data to decrypt")
            
        fernet = generate_fernet_key()
        return fernet.decrypt(encrypted_data)
    except InvalidToken:
        raise Exception("Invalid or corrupted encrypted data")
    except Exception as e:
        print(f"Decryption error: {e}")
        traceback.print_exc()
        raise

def create_connection():
    try:
        connection = mysql.connector.connect(**DATABASE_CONFIG)
        return connection
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None

def is_logged_in():
    return 'user' in session

# Custom login_required decorator to ensure `current_user` is passed correctly
def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'user' not in session:  # Check if the user is logged in
            return jsonify({'message': 'Unauthorized'}), 401
        current_user = session['user']  # Extract current user from session
        return func(current_user, *args, **kwargs)  # Pass current_user along with other args
    return wrapper

def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'user' not in session:
            return jsonify({"success": False, "error": "Not logged in"}), 401
        
        user = session.get('user')
        if not user or not user.get('is_admin'):
            return jsonify({"success": False, "error": "Admin privileges required"}), 403
            
        return func(user, *args, **kwargs)
    return wrapper

class User:
    def __init__(self, id, email, role, is_active, is_admin):
        self.id = id
        self.email = email
        self.role = role
        self.is_active = is_active
        self.is_admin = is_admin

    @classmethod
    def get_user(cls, connection, user_id):
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT id, email, password, role, is_active, is_admin FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if user and user[4]:  # Check for active user
                return cls(user[0], user[1], user[3], user[4], user[5])
            else:
                return None
        except Exception as e:
            print(f"Error fetching user: {e}")
            return None

@app.route('/admin_dashboard')
@login_required
def admin_dashboard(current_user):
    return render_template('admin_dashboard.html')

@app.route('/user_dashboard')
@login_required
def user_dashboard(current_user):
    return render_template('user_dashboard.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    selected_role = data.get('role')

    try:
        connection = create_connection()
        cursor = connection.cursor()
        cursor.execute("""
            SELECT id, email, password, is_active, is_admin 
            FROM users 
            WHERE email = %s
        """, (email,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'message': 'User not found'}), 404

        # Validate user status and credentials
        user_id, user_email, user_password, is_active, is_admin = user
        if not is_active:
            return jsonify({'message': 'Account is deactivated. Please contact admin.'}), 403
        if not bcrypt.checkpw(password.encode('utf-8'), user_password.encode('utf-8')):
            return jsonify({'message': 'Invalid password'}), 401

        # Check if the selected role matches the user's actual role
        if selected_role == 'admin' and not is_admin:
            return jsonify({'message': 'You cannot log in as an admin with these credentials.'}), 401
        if selected_role == 'user' and is_admin:
            return jsonify({'message': 'You cannot log in as a user with these credentials.'}), 401

        # Store user details in session
        session['user'] = {
            'id': user_id,
            'email': user_email,
            'is_admin': is_admin,
            'role': 'admin' if is_admin else 'user'  # Add role to session
        }

        # Generate a token (optional if needed)
        payload = {
            'user_id': user_id,
            'email': user_email,
            'is_admin': is_admin,
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

        # Log the login activity
        action = 'logged in as admin' if is_admin else 'logged in as user'
        cursor.execute("""
            INSERT INTO activity_logs (user_id, action) 
            VALUES (%s, %s)
        """, (user_id, action))
        connection.commit()

        return jsonify({'message': 'Login successful!', 'token': token, 'is_admin': is_admin}), 200

    except Exception as e:
        print(f"Error during login: {e}")
        return jsonify({'message': 'Login failed', 'error': str(e)}), 500
    finally:
        if connection:
            connection.close()

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Email and password are required'}), 400

    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Check if email already exists
        cursor.execute("SELECT email FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'message': 'Email already exists'}), 400

        # Hash the password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        # Check if the new user is the first user
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        is_admin = user_count == 0
        role = 'admin' if is_admin else 'user'

        # Insert the user with the appropriate role
        cursor.execute("""
            INSERT INTO users (email, password, role, is_active, is_admin)
            VALUES (%s, %s, %s, True, %s)
        """, (email, hashed_password.decode('utf-8'), role, is_admin))
        connection.commit()

        # Log the registration activity
        log_query = """
            INSERT INTO activity_logs (user_id, action, timestamp)
            VALUES (%s, %s, NOW())
        """
        user_id = cursor.lastrowid
        cursor.execute(log_query, (user_id, f"Registered new user with email {email}"))
        connection.commit()

        # Log the promotion to admin if applicable
        if is_admin:
            cursor.execute(log_query, (user_id, f"Promoted user with email {email} to admin"))
            connection.commit()

        return jsonify({'message': 'Registration successful'}), 201

    except Exception as e:
        print(f"Error during registration: {e}")
        return jsonify({'message': 'Registration failed', 'error': str(e)}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_users', methods=['GET'])
@login_required
def get_users(current_user):
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit

        connection = create_connection()
        cursor = connection.cursor(dictionary=True)

        # Include is_active in the SELECT statement
        cursor.execute("""
            SELECT id, email, role, is_active 
            FROM users 
            LIMIT %s OFFSET %s
        """, (limit, offset))
        users = cursor.fetchall()

        cursor.execute("SELECT COUNT(*) as count FROM users")
        total = cursor.fetchone()['count']

        return jsonify({
            'users': users,
            'total': total,
            'success': True
        }), 200

    except mysql.connector.Error as e:
        print(f"Error getting users: {e}")
        return jsonify({'error': str(e), "success": False}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_dashboard_data', methods=['GET'])
@login_required
def get_dashboard_data(current_user):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Fetch total document count
        cursor.execute("SELECT COUNT(*) FROM documents")
        total_documents = cursor.fetchone()[0]

        # Fetch total users count
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]

        # Fetch the latest 7 activities (assuming the table is named 'activity_logs' with a timestamp column)
        cursor.execute("""
            SELECT action, timestamp FROM activity_logs 
            ORDER BY timestamp DESC LIMIT 7
        """)
        recent_activities = cursor.fetchall()

        # Prepare the activity data in a more readable format
        activities = [{"action": activity[0], "timestamp": activity[1].strftime('%Y-%m-%d %H:%M:%S')} for activity in recent_activities]

        return jsonify({
            "total_documents": total_documents,
            "total_users": total_users,
            "recent_activities": activities
        }), 200

    except Exception as e:
        print(f"Error getting dashboard data: {e}")
        return jsonify({"message": "Failed to get dashboard data"}), 500

    finally:
        if connection:
            connection.close()

@app.route('/get_admin_name', methods=['GET'])
@login_required
def get_admin_name(current_user):
    try:
        connection = create_connection()
        cursor = connection.cursor()
        user_id = current_user['id']
        cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        admin_name = cursor.fetchone()[0]
        return jsonify({"admin_name": admin_name}), 200
    except Exception as e:
        print(f"Error getting admin name: {e}")
        return jsonify({"message": "Failed to get admin name"}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_user_name', methods=['GET'])
@login_required
def get_user_name(current_user):
    try:
        connection = create_connection()
        cursor = connection.cursor()
        user_id = current_user['id']
        cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        user_name = cursor.fetchone()[0]
        return jsonify({"user_name": user_name}), 200
    except Exception as e:
        print(f"Error getting user name: {e}")
        return jsonify({"message": "Failed to get user name"}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_documents', methods=['GET'])
@login_required
def get_documents(current_user):
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit

        connection = create_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Updated query to ensure ID is included and no NULL values
        if current_user.get('is_admin'):
            query = """
                SELECT 
                    id, 
                    name, 
                    upload_date, 
                    user_id 
                FROM documents 
                WHERE status = 'active' AND id IS NOT NULL
                ORDER BY upload_date DESC 
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, (limit, offset))
        else:
            query = """
                SELECT 
                    id, 
                    name, 
                    upload_date, 
                    user_id 
                FROM documents 
                WHERE status = 'active' 
                    AND id IS NOT NULL 
                    AND user_id = %s 
                ORDER BY upload_date DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, (current_user['id'], limit, offset))

        documents = cursor.fetchall()
        
        # Debug logging
        print(f"Retrieved documents: {documents}")
        
        # Verify documents have IDs
        for doc in documents:
            if not doc['id']:
                print(f"Warning: Document missing ID: {doc}")

        # Get total count
        cursor.execute(
            "SELECT COUNT(*) as count FROM documents WHERE status = 'active'"
            + ("" if current_user.get('is_admin') else " AND user_id = %s"),
            ([] if current_user.get('is_admin') else [current_user['id']])
        )
        total = cursor.fetchone()['count']

        return jsonify({
            "success": True,
            "documents": documents,
            "total": total
        }), 200

    except Exception as e:
        print(f"Error getting documents: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "Failed to get documents"
        }), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_user_documents', methods=['GET'])
@login_required
def get_user_documents(current_user):
    try:
        connection = create_connection()
        cursor = connection.cursor(dictionary=True)
        user_id = current_user['id']

        query = "SELECT id, name, upload_date FROM documents WHERE user_id = %s AND status = 'active'"
        cursor.execute(query, (user_id,))
        documents = cursor.fetchall()

        return jsonify({"success": True, "documents": documents}), 200
    except Exception as e:
        print(f"Error getting user documents: {e}")
        return jsonify({"message": "Failed to get documents", "error": str(e)}), 500
    finally:
        if connection:
            connection.close()

@app.route('/upload_document', methods=['POST'])
@login_required
def upload_document(current_user):
    connection = None
    try:
        if 'file' not in request.files:
            return jsonify({"message": "No file part"}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({"message": "No selected file"}), 400

        filename = secure_filename(file.filename)
        file_data = file.read()
        
        # Encrypt file data
        fernet = generate_fernet_key()
        encrypted_data = fernet.encrypt(file_data)
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(file_path, 'wb') as f:
            f.write(encrypted_data)

        connection = create_connection()
        if not connection:
            return jsonify({"message": "Database connection failed"}), 500
            
        cursor = connection.cursor()
        user_id = current_user['id']
        cursor.execute("""
            INSERT INTO documents (name, file_path, user_id, status) 
            VALUES (%s, %s, %s, 'active')
        """, (filename, file_path, user_id))
        connection.commit()

        # Log the activity
        cursor.execute("""
            INSERT INTO activity_logs (user_id, action) 
            VALUES (%s, %s)
        """, (user_id, 'Uploaded a document'))
        connection.commit()

        return jsonify({"message": "Document uploaded successfully!"}), 201

    except Exception as e:
        print(f"Error in upload_document: {e}")
        if connection:
            connection.rollback()
        return jsonify({"message": "Failed to upload document", "error": str(e)}), 500
    finally:
        if connection:
            connection.close()

def send_decrypted_file(file_path, filename, attachment=False):
    try:
        with open(file_path, 'rb') as f:
            encrypted_data = f.read()

        # Decrypt the file
        fernet = generate_fernet_key()
        decrypted_data = fernet.decrypt(encrypted_data)

        response = make_response(decrypted_data)
        response.headers['Content-Type'] = 'application/octet-stream'
        disposition = 'attachment' if attachment else 'inline'
        response.headers['Content-Disposition'] = f'{disposition}; filename="{filename}"'
        return response

    except Exception as e:
        return jsonify({"error": "Error processing file", "details": str(e), "success": False}), 500

@app.route('/user/document/<int:doc_id>/download', methods=['GET'])
@login_required
def download_document(current_user, doc_id):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        if current_user.get('is_admin'):
            query = "SELECT name, file_path FROM documents WHERE id = %s"
            cursor.execute(query, (doc_id,))
        else:
            query = "SELECT name, file_path FROM documents WHERE id = %s AND user_id = %s AND status = 'active'"
            cursor.execute(query, (doc_id, current_user['id']))

        result = cursor.fetchone()
        if not result:
            return jsonify({"error": "Document not found", "success": False}), 404

        filename, file_path = result
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found on server", "success": False}), 404

        return send_decrypted_file(file_path, filename, attachment=True)

    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if connection:
            connection.close()

@app.route('/delete_document/<int:doc_id>', methods=['DELETE'])
@login_required
def delete_document(current_user, doc_id):
    connection = None
    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Fetch the document's file path from the database
        cursor.execute("SELECT file_path FROM documents WHERE id = %s", (doc_id,))
        result = cursor.fetchone()

        # If document not found, return error
        if not result:
            return jsonify({"message": "Document not found", "success": False}), 404

        file_path = result[0]

        # If file exists, remove it
        if os.path.exists(file_path):
            os.remove(file_path)

        # Delete document from the database
        cursor.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
        connection.commit()

        # Log the activity
        user_id = current_user['id']  # Use current_user from the session
        cursor.execute("INSERT INTO activity_logs (user_id, action) VALUES (%s, %s)",
                       (user_id, f'Deleted document with ID {doc_id}'))
        connection.commit()

        # Return success response
        return jsonify({
            "message": "Document and file deleted successfully",
            "success": True,
            "document_id": doc_id
        }), 200

    except Exception as e:
        # Print error and return failure response
        print(f"Error in delete_document (ID: {doc_id}): {e}")
        return jsonify({"message": str(e), "success": False}), 500

    finally:
        if connection:
            connection.close()

@app.route('/get-document-count', methods=['GET'])
@login_required  # If required, based on your authentication setup
def get_document_count(current_user):  # Accept current_user here
    try:
        connection = create_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT COUNT(*) FROM documents")
        count = cursor.fetchone()[0]
        return jsonify({"success": True, "count": count}), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_all_documents', methods=['POST'])
@login_required
def get_all_documents(current_user):
    try:
        connection = create_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM documents WHERE status = 'active'")
        documents = cursor.fetchall()
        document_list = []
        for document in documents:
            document_list.append({
                "id": document[0],
                "name": document[1],
                "file_path": document[2],
                "upload_date": str(document[3]),
                "user_id": document[4]
            })
        return jsonify({"documents": document_list, "success": True}), 200
    except Exception as e:
        print(f"Error getting all documents: {e}")
        return jsonify({"message": "Failed to get all documents"}), 500
    finally:
        if connection:
            connection.close()

@app.route('/get_activity_logs', methods=['POST'])
@login_required
def get_activity_logs(current_user):
    search_term = request.json.get('search_term', '')
    try:
        connection = create_connection()
        cursor = connection.cursor(dictionary=True)

        if (search_term):
            query = "SELECT * FROM activity_logs WHERE user_id LIKE %s OR action LIKE %s"
            cursor.execute(query, (f'%{search_term}%', f'%{search_term}%'))
        else:
            query = "SELECT * FROM activity_logs"
            cursor.execute(query)

        logs = cursor.fetchall()
        return jsonify({"success": True, "logs": logs}), 200
    except Exception as e:
        print(f"Error getting activity logs: {e}")
        return jsonify({"success": False, "message": "Failed to get activity logs"}), 500
    finally:
        if connection:
            connection.close()

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully!'}), 200

@app.route('/profile_pictures/<filename>')
def profile_pictures(filename):
    try:
        return send_from_directory('images/profile_pictures', filename)
    except FileNotFoundError:
        return send_from_directory('images/profile_pictures', 'default-profile.png')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('frontend', path)

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory(os.path.join(app.static_folder, 'images'), filename)

@app.route('/admin/users/status', methods=['POST'])
@admin_required
def update_user_status(current_user):
    data = request.json
    user_id = data.get('user_id')
    is_active = data.get('is_active')

    try:
        connection = create_connection()
        cursor = connection.cursor()
        cursor.execute("UPDATE users SET is_active = %s WHERE id = %s", (is_active, user_id))
        connection.commit()
        # Log the activity
        action = "Activated user" if is_active else "Deactivated user"
        log_query = "INSERT INTO activity_logs (user_id, action, timestamp) VALUES (%s, %s, NOW())"
        cursor.execute(log_query, (current_user['id'], f"{action} user with ID {user_id}"))
        connection.commit()

        return jsonify({"success": True, "message": f"User status updated to {'Active' if is_active else 'Inactive'}"}), 200
    except Exception as e:
        print(f"Error updating user status: {e}")
        return jsonify({"success": False, "message": "Failed to update user status"}), 500
    finally:
        if connection:
            connection.close()

@app.route('/admin/users/delete', methods=['DELETE'])
@admin_required
def delete_user_account(current_user):
    user_id = request.args.get('user_id')

    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Log the action before deleting the user
        admin_id = current_user['id']  # Assuming `current_user` provides the logged-in admin's details
        log_query = "INSERT INTO activity_logs (user_id, action, timestamp) VALUES (%s, %s, NOW())"
        log_message = f"Admin with ID {admin_id} deleted user with ID {user_id}"
        cursor.execute(log_query, (admin_id, log_message))

        # Delete the user
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        connection.commit()

        return jsonify({"success": True, "message": "User account deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if connection:
            connection.close()

@app.route('/admin/document/<int:doc_id>/download', methods=['GET'])
@admin_required
def download_admin_document(current_user, doc_id):
    connection = None
    try:
        if not doc_id:
            return jsonify({"error": "Invalid document ID", "success": False}), 400

        connection = create_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT name, file_path FROM documents WHERE id = %s", (doc_id,))
        result = cursor.fetchone()

        if not result:
            return jsonify({"error": "Document not found", "success": False}), 404

        filename, file_path = result

        if not os.path.exists(file_path):
            return jsonify({"error": "File not found on server", "success": False}), 404

        return send_decrypted_file(file_path, filename, attachment=True)

    except Exception as e:
        print(f"Error in download_admin_document: {e}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if connection:
            connection.close()

@app.route('/admin/document/<int:doc_id>/delete', methods=['DELETE'])
@admin_required
def admin_delete_document(current_user, doc_id):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Admin can delete any document
        cursor.execute("SELECT file_path FROM documents WHERE id = %s", (doc_id,))
        result = cursor.fetchone()

        if not result:
            return jsonify({
                "success": False,
                "error": "Document not found"
            }), 404

        file_path = result[0]

        if os.path.exists(file_path):
            os.remove(file_path)

        cursor.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
        connection.commit()

        cursor.execute(
            "INSERT INTO activity_logs (user_id, action) VALUES (%s, %s)",
            (current_user['id'], f'Admin deleted document {doc_id}')
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Document deleted successfully"
        }), 200

    except Exception as e:
        print(f"Error in admin_delete_document: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
    finally:
        if connection:
            connection.close()

@app.route('/user/document/<int:doc_id>/delete', methods=['DELETE'])
@login_required
def delete_user_document(current_user, doc_id):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        # Check if document exists and belongs to the user
        cursor.execute("""
            SELECT file_path FROM documents 
            WHERE id = %s AND user_id = %s
        """, (doc_id, current_user['id']))
        result = cursor.fetchone()

        if not result:
            return jsonify({
                "success": False, 
                "error": "Document not found or you don't have permission to delete it"
            }), 404

        file_path = result[0]

        # Delete file from filesystem if it exists
        if os.path.exists(file_path):
            os.remove(file_path)

        # Delete document from database
        cursor.execute("DELETE FROM documents WHERE id = %s AND user_id = %s", 
                      (doc_id, current_user['id']))
        connection.commit()

        # Log the activity
        cursor.execute(
            "INSERT INTO activity_logs (user_id, action) VALUES (%s, %s)",
            (current_user['id'], f'Deleted document {doc_id}')
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Document deleted successfully"
        }), 200

    except Exception as e:
        print(f"Error in delete_user_document: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
    finally:
        if connection:
            connection.close()

@app.route('/user/document/<int:doc_id>/decrypt', methods=['GET'])
@login_required
def decrypt_user_document(current_user, doc_id):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT file_path FROM documents WHERE id = %s AND user_id = %s", (doc_id, current_user['id']))
        result = cursor.fetchone()

        if not result:
            return jsonify({"error": "Document not found", "success": False}), 404

        file_path = result[0]

        if not os.path.exists(file_path):
            return jsonify({"error": "File not found on server", "success": False}), 404

        try:
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()

            decrypted_data = decrypt_file(encrypted_data)

            # Save the decrypted file temporarily
            temp_file_path = file_path + '.decrypted'
            with open(temp_file_path, 'wb') as f:
                f.write(decrypted_data)

            return jsonify({"message": "File decrypted successfully", "temp_file_path": temp_file_path, "success": True}), 200
        except Exception as e:
            print(f"Error decrypting file: {e}")
            return jsonify({"error": "Error decrypting file", "details": str(e), "success": False}), 500

    except Exception as e:
        print(f"Error in decrypt_user_document: {e}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if connection:
            connection.close()

@app.route('/admin/document/<int:doc_id>/decrypt', methods=['GET'])
@admin_required
def decrypt_admin_document(current_user, doc_id):
    try:
        connection = create_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT file_path FROM documents WHERE id = %s", (doc_id,))
        result = cursor.fetchone()

        if not result:
            return jsonify({"error": "Document not found", "success": False}), 404

        file_path = result[0]

        if not os.path.exists(file_path):
            return jsonify({"error": "File not found on server", "success": False}), 404

        try:
            with open(file_path, 'rb') as f:
                encrypted_data = f.read()

            decrypted_data = decrypt_file(encrypted_data)

            # Save the decrypted file temporarily
            temp_file_path = file_path + '.decrypted'
            with open(temp_file_path, 'wb') as f:
                f.write(decrypted_data)

            return jsonify({"message": "File decrypted successfully", "temp_file_path": temp_file_path, "success": True}), 200
        except Exception as e:
            print(f"Error decrypting file: {e}")
            return jsonify({"error": "Error decrypting file", "details": str(e), "success": False}), 500

    except Exception as e:
        print(f"Error in decrypt_admin_document: {e}")
        return jsonify({"error": str(e), "success": False}), 500
    finally:
        if connection:
            connection.close()

if __name__ == '__main__':
    app.run(debug=True, port=8080)
