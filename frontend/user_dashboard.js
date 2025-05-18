document.addEventListener('DOMContentLoaded', function() {
    getUserDocuments(); // Fetch and populate the table when the DOM is ready

    const navLinks = document.querySelectorAll('.top-nav ul li a');
    const contentSections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSectionId = link.dataset.section;

            contentSections.forEach(section => section.classList.remove('active'));
            navLinks.forEach(navLink => navLink.classList.remove('active'));

            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                link.classList.add('active');
            }
        });
    });

    if (navLinks.length > 0) {
        navLinks[0].click();
    }

    document.getElementById('currentYear').textContent = new Date().getFullYear();
    document.getElementById('uploadBtn').addEventListener('click', uploadDocument);

    const profileImage = document.getElementById('profileImage');
    const profileDropdown = document.getElementById('profileDropdown');
    const logoutLink = document.getElementById('logoutLink');

    if (profileImage) {
        profileImage.onerror = function() {
            this.style.display = 'none';
        };
        
        profileImage.addEventListener('click', () => {
            profileDropdown.classList.toggle('show');
        });
    }

    window.addEventListener('click', (event) => {
        if (profileImage && profileDropdown && !profileImage.contains(event.target) && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('show');
        }
    });

    getUserName();

    // Add event listeners for footer links
    const footerLinks = document.querySelectorAll('.footer-section a[data-section]');
    footerLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSectionId = link.dataset.section;
            
            // Remove active class from all sections and nav links
            contentSections.forEach(section => section.classList.remove('active'));
            navLinks.forEach(navLink => navLink.classList.remove('active'));
            
            // Activate target section
            const targetSection = document.getElementById(targetSectionId);
            const targetNavLink = document.querySelector(`.top-nav a[data-section="${targetSectionId}"]`);
            
            if (targetSection && targetNavLink) {
                targetSection.classList.add('active');
                targetNavLink.classList.add('active');
                
                // Scroll to top of the section
                targetSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});

async function getUserDocuments() {
    try {
        const response = await fetch('/get_user_documents', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        if (data.success) {
            populateDocumentsTable(data.documents);
        } else {
            console.error('Failed to load documents:', data.error);
        }
    } catch (error) {
        console.error('Error loading documents:', error);
    }
}

async function deleteUserDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    try {
        const isAdmin = localStorage.getItem('role') === 'admin';
        const endpoint = isAdmin 
            ? `/admin/document/${docId}/delete`  // Admin endpoint
            : `/user/document/${docId}/delete`;  // User endpoint

        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            alert(data.message);
            getUserDocuments(); // Refresh the document list
        } else {
            alert(data.error || 'Failed to delete document.');
        }
    } catch (error) {
        console.error('Error deleting document:', error);
        alert('An error occurred while deleting the document.');
    }
}

function populateDocumentsTable(documents) {
    const tableBody = document.querySelector('#documentsTable tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    if (!documents || documents.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">No documents found</td></tr>';
        return;
    }

    documents.forEach(doc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${doc.id}</td>
            <td>${doc.name}</td>
            <td>${new Date(doc.upload_date).toLocaleDateString()}</td>
            <td>
                <button onclick="downloadDocument(${doc.id})" class="download-btn" title="Download Document">
                    <i class="fas fa-download"></i>
                </button>
                <button onclick="deleteUserDocument(${doc.id})" class="delete-btn" title="Delete Document">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function uploadDocument() {
    const fileInput = document.getElementById('documentUpload');
    if (!fileInput) {
        console.error('File input element not found');
        alert('File input element not found');
        return;
    }

    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload_document', {  // Changed from '/upload_user_document' to '/upload_document'
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            alert('Document uploaded successfully!');
            fileInput.value = ''; // Clear file input
            getUserDocuments(); // Refresh the document table
        } else {
            const errorData = await response.json();
            console.error('Error uploading document:', errorData);
            alert(errorData.message || 'Failed to upload document.');
        }
    } catch (error) {
        console.error('Error uploading document:', error);
        alert('An error occurred while uploading the document.');
    }
}

async function downloadDocument(docId) {
    try {
        showLoadingSpinner();
        const response = await fetch(`/user/document/${docId}/download`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to download document');
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'document';
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading document:', error);
        alert('An error occurred while downloading the document: ' + error.message);
    } finally {
        hideLoadingSpinner();
    }
}

function showLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.id = 'loadingSpinner';
    document.body.appendChild(spinner);
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.remove();
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

async function getUserName() {
    try {
        const response = await fetch('/get_user_name', { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        document.getElementById('userName').textContent = data.user_name;

        const profileImage = document.getElementById('profileImage');
        profileImage.src = `/profile_pictures/${data.user_name}.jpg`;
        profileImage.onload = function() {
            if (this.naturalWidth === 0 || this.naturalHeight === 0) {
                this.style.display = 'none';
            }
        };
        profileImage.onerror = function() {
            this.style.display = 'none';
        };
    } catch (error) {
        console.error('Error getting user name:', error);
        document.getElementById('userName').textContent = "User";
    }
}
