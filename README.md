# Secure Document Management System (DMS)

This project is a Secure Document Management System (DMS) designed to store, manage, and share sensitive documents with a focus on security and user access control.

## Features

- 🔐 **User Authentication** with hashed passwords (bcrypt)
- 🎭 **Role-Based Access Control (RBAC)** for Admins and Users
- 📄 **Document Encryption** using AES
- 📜 **Audit Logging** for traceability
- 💾 **MySQL database** for user and document storage
- 🌐 **Flask-based** web interface

## Tech Stack

- Python (Flask)
- MySQL
- HTML/CSS/JavaScript (Frontend)
- AES for encryption
- bcrypt for password hashing

## Installation

```bash
git clone https://github.com/Ihtesham-4s/dms-project.git
cd dms-project
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
