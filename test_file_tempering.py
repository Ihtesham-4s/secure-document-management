import os

# Replace with the actual file name of the encrypted file you want to tamper with
encrypted_file_name = 'uploads/lab_08.docx'  # Corrected file path

if os.path.exists(encrypted_file_name):
    try:
        with open(encrypted_file_name, 'rb+') as file:
            content = bytearray(file.read())
            content[10:20] = b'corrupted!'  # Overwrite random bytes in the encrypted file
            file.seek(0)
            file.write(content)
        print(f"File '{encrypted_file_name}' tampered successfully!")
    except Exception as e:
        print(f"Error tampering file: {e}")
else:
    print(f"File '{encrypted_file_name}' does not exist!")
