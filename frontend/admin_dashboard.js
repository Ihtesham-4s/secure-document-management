async function getAllUsers(page = 1, usersPerPage = 10) {
    try {
        const response = await fetch(`/get_users?page=${page}&limit=${usersPerPage}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        console.log('API Response:', data); // Log the API response
        if (data.success) {
            return data; // Return the full response containing 'users' and 'total'
        } else {
            console.error('Failed to load users:', data.error);
            return null;
        }
    } catch (error) {
        console.error('Error loading users:', error);
        return null;
    }
}

function renderTableData(users) {
    const tbody = document.getElementById('usersTable').querySelector('tbody');
    tbody.innerHTML = '';

    if (!Array.isArray(users) || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No users found</td></tr>';
        return;
    }

    const currentUser  = JSON.parse(localStorage.getItem('user') || '{}');

    users.forEach(user => {
        const row = tbody.insertRow();
        row.dataset.userId = user.id;

        const cells = [
            { text: user.id },
            { text: user.email },
            { text: user.role },
            { text: user.is_active ? 'Active' : 'Inactive' }, // Status column
            { // Actions column
                html: user.id !== currentUser .id && user.role !== 'admin' ? 
                    `<button class="activate-btn" data-user-id="${user.id}">Activate</button>
                     <button class="deactivate-btn" data-user-id="${user.id}">Deactivate</button>
                     <button class="delete-btn" data-user-id="${user.id}">Delete</button>` 
                    : ''
            }
        ];

        cells.forEach(cellData => {
            const cell = row.insertCell();
            if (cellData.text !== undefined) {
                cell.textContent = cellData.text;
            } else if (cellData.html !== undefined) {
                cell.innerHTML = cellData.html;
            }
        });

        // Add event listeners only if action buttons exist
        const actionButtons = row.querySelectorAll('button');
        if (actionButtons.length > 0) {
            row.querySelector('.activate-btn').addEventListener('click', () => updateUserStatus(user.id, true));
            row.querySelector('.deactivate-btn').addEventListener('click', () => updateUserStatus(user.id, false));
            row.querySelector('.delete-btn').addEventListener('click', () => deleteUser (user.id));
        }
    });
}

async function updateUserStatus(userId, isActive) {
    try {
        const response = await fetch('/admin/users/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, is_active: isActive })
        });

        const data = await response.json();
        if (data.success) {
            alert(data.message);
            getAllUsers(); // Refresh the user list
        } else {
            alert(data.error || 'Failed to update user status.');
        }
    } catch (error) {
        console.error('Error updating user status:', error);
        alert('An error occurred while updating user status.');
    }
}

async function deleteUser (userId) {
    try {
        const response = await fetch(`/admin/users/delete?user_id=${userId}`, {
            method: 'DELETE',
        });

        const data = await response.json();
        if (data.success) {
            alert(data.message);
            getAllUsers();
        } else {
            alert(data.error || 'Failed to delete user.');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('An error occurred while deleting the user.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    getAllUsers();
});

async function getActivityLogs(searchTerm = '') {
    try {
        const response = await fetch('/get_activity_logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`, // Include token if required
            },
            body: JSON.stringify({ search_term: searchTerm }),
        });

        const data = await response.json();
        if (data.success) {
            renderActivityLogs(data.logs);
        } else {
            console.error('Failed to load activity logs:', data.message);
            alert('Failed to load activity logs.');
        }
    } catch (error) {
        console.error('Error loading activity logs:', error);
        alert('Error loading activity logs.');
    }
}

function renderActivityLogs(logs) {
    const logsTableBody = document.getElementById('logsTable').querySelector('tbody');
    logsTableBody.innerHTML = ''; // Clear existing logs

    if (logs && logs.length > 0) {
        logs.forEach(log => {
            const row = logsTableBody.insertRow();
            row.insertCell().textContent = log.id;
            row.insertCell().textContent = log.user_id;
            row.insertCell().textContent = log.action;
            row.insertCell().textContent = log.timestamp;
        });
    } else {
        logsTableBody.innerHTML = '<tr><td colspan="4">No logs found</td></tr>';
    }
}

function filterLogs(searchTerm, filterType) {
    const logsTable = document.getElementById('logsTable');
    const logsTableBody = logsTable.querySelector('tbody');
    const rows = Array.from(logsTableBody.querySelectorAll('tr'));

    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        let match = false;

        if (cells.length > 0) {
            const action = cells[2]?.textContent?.toLowerCase() || '';  // Assuming action is in the third column
            const searchTermLower = searchTerm.toLowerCase();

            // Check if the action or other columns match the search term
            const matchesSearch = searchTerm === "" || 
                cells.some((cell, index) => index === 2 ? action.includes(searchTermLower) : cell.textContent.toLowerCase().includes(searchTermLower));

            // Check if the action matches the filter type
            const matchesFilter = filterType === "" || (() => {
                switch(filterType.toLowerCase()) {
                    case 'user management':
                        return action.includes('user') || 
                               action.includes('activated') || 
                               action.includes('deactivated') ||
                               action.includes('deleted user');
                    case 'document management':
                        return action.includes('document') || 
                               action.includes('uploaded') || 
                               action.includes('deleted doc');
                    case 'login activity':
                        return action.includes('login') || 
                               action.includes('logged in') || 
                               action.includes('logged out');
                    default:
                        return true;
                }
            })();

            match = matchesSearch && matchesFilter;
        }
        row.style.display = match ? '' : 'none';
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
        const response = await fetch('/upload_document', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            alert('Document uploaded successfully!');
            fileInput.value = ''; // Clear file input
            getAllDocuments(); // Refresh the document table
        } else {
            // Handle non-JSON response (e.g., display a user-friendly error message)
            const text = await response.text(); // Read the response as text
            console.error('Error uploading document:', text);
            alert('Failed to upload document. Please check server logs for details.');
        }
    } catch (error) {
        console.error('Error uploading document:', error);
        alert('An error occurred while uploading the document.');
    }
}

async function getAdminName() {
    try {
        const response = await fetch('/get_admin_name', { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        document.getElementById('adminName').textContent = data.admin_name;

        // Update profile picture path
        const profileImage = document.getElementById('profileImage');
        profileImage.src = `/profile_pictures/${data.admin_name}.jpg`;
        profileImage.onload = function() {
            if (this.naturalWidth === 0 || this.naturalHeight === 0) {
                this.style.display = 'none';
            }
        };
        profileImage.onerror = function() {
            this.style.display = 'none';
        };
    } catch (error) {
        console.error('Error getting admin name:', error);
        document.getElementById('adminName').textContent = "Admin";
    }
}

async function loadDashboardData() {
    try {
        const response = await fetch('/get_dashboard_data', { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        document.getElementById('totalDocumentsCard').querySelector('.card-value').textContent = data.total_documents || 0;
        document.getElementById('totalUsersCard').querySelector('.card-value').textContent = data.total_users || 0;
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function getAllDocuments() {
    try {
        const response = await fetch('/get_documents', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();
        console.log('Documents API response:', data); // Debug log

        if (data.success) {
            populateDocumentsTable(data.documents);
        } else {
            console.error('Failed to load documents:', data.error);
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading documents:', error);
        alert('Failed to load documents. Please try again.');
    }
}

// Define setupTable
function setupTable(tableId, fetchDataFunction, searchId, searchFields) {
    const table = document.getElementById(tableId);
    const searchInput = document.getElementById(searchId);
    let data = [];

    fetchDataFunction().then(fetchedData => {
        data = fetchedData;
        renderTableData(table, data, tableId);

        table.addEventListener('click', (event) => {
            if (event.target.tagName === 'TH') {
                const column = event.target.dataset.sort;
                sortTable(table, column, data);
            }
        });

        searchInput.addEventListener('input', () => {
            filterTable(table, searchInput.value, data, searchFields);
        });
    });
}

// Call setupTable after the document is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    getAllDocuments(); // Fetch and populate the table when the DOM is ready
    setupUserTable('usersTable', getAllUsers, 'userSearch', 1, 10, ['id', 'email', 'role']);
});

function filterTable(table, searchValue, users, searchFields) {
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    const filteredUsers = users.filter(user => {
        return searchFields.some(field => {
            const fieldValue = user[field]?.toString().toLowerCase() || ''; // Ensure it's a string and lowercase
            return fieldValue.includes(searchValue.toLowerCase());
        });
    });

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No matching users found</td></tr>';
    } else {
        filteredUsers.forEach(user => {
            const row = tbody.insertRow();
            row.dataset.userId = user.id;

            const cells = [
                { text: user.id },               // User ID column
                { text: user.email },            // Email column
                { text: user.role },             // Role column
                { text: user.is_active ? 'Active' : 'Inactive' }, // Status column
                { // Actions column
                    html: user.role !== 'admin' ? 
                        `<button class="activate-btn" data-user-id="${user.id}">Activate</button>
                         <button class="deactivate-btn" data-user-id="${user.id}">Deactivate</button>
                         <button class="delete-btn" data-user-id="${user.id}">Delete</button>` 
                        : '' // No action buttons for admin users
                }
            ];

            cells.forEach(cellData => {
                const cell = row.insertCell();
                if (cellData.text !== undefined) {
                    cell.textContent = cellData.text;
                } else if (cellData.html !== undefined) {
                    cell.innerHTML = cellData.html;
                }
            });

            // Add event listeners only if action buttons exist and the user is not an admin
            if (user.role !== 'admin') {
                const actionButtons = row.querySelectorAll('button');
                if (actionButtons.length > 0) {
                    row.querySelector('.activate-btn').addEventListener('click', () => updateUserStatus(user.id, true));
                    row.querySelector('.deactivate-btn').addEventListener('click', () => updateUserStatus(user.id, false));
                    row.querySelector('.delete-btn').addEventListener('click', () => deleteUser (user.id));
                }
            }
        });
    }
}

async function setupUserTable(tableId, fetchDataFunction, searchId, currentPage, usersPerPage, searchFields) {
    const table = document.getElementById(tableId);
    const searchInput = document.getElementById(searchId);
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const currentPageSpan = document.getElementById('currentPage');
    let allUserData; // Store all user data including total

    // Function to load users for a specific page
    async function loadUsersForPage(page) {
        try {
            const userData = await fetchDataFunction(page, usersPerPage);  // Ensure page and usersPerPage are passed
            if (!userData) return; // Handle error case from getAllUsers
            allUserData = userData; // Store the full data
            currentPageSpan.textContent = page;
            renderTableData(userData.users);  // Ensure you pass users to the renderTableData function
        } catch (error) {
            console.error("Error loading users:", error);
            table.querySelector('tbody').innerHTML = `<tr><td colspan="4">Error loading users: ${error.message}</td></tr>`;
        }
    }

    await loadUsersForPage(currentPage); // Load initial data

    // Sort table by clicking on column headers
    table.addEventListener('click', (event) => {
        if (event.target.tagName === 'TH' && allUserData && allUserData.users) {
            const column = event.target.dataset.sort;
            sortTable(table, column, allUserData.users);
        }
    });

    // Search filter input event
    searchInput.addEventListener('input', () => {
        if (allUserData && allUserData.users) {
            filterTable(table, searchInput.value, allUserData.users, searchFields);
        }
    });

    // Handle pagination for previous and next page buttons
    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadUsersForPage(currentPage);
        }
    });

    nextPageButton.addEventListener('click', async () => {
        if (!allUserData) return;
        const totalPages = Math.ceil(allUserData.total / usersPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            loadUsersForPage(currentPage);
        }
    });
}

function sortTable(table, column, data) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || !Array.isArray(data)) return;

    const sortedData = [...data].sort((a, b) => { // Sort a COPY of the data
        const aValue = a[column];
        const bValue = b[column];
        return String(aValue).localeCompare(String(bValue));
    });

    renderTableData(table, sortedData, table.id);
}

async function handleDeleteDocument(documentId) {
    // Confirm delete action
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
        return;
    }

    try {
        // Send DELETE request to the backend
        const response = await fetch(`/delete_document/${documentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        // Check if request was successful
        if (!response.ok) {
            throw new Error(`Failed to delete document: ${response.statusText}`);
        }

        const result = await response.json();

        // If the document was successfully deleted
        if (result.success) {
            // Remove document row from UI
            const row = document.querySelector(`[data-document-id="${documentId}"]`);
            if (row) row.remove();
            alert('Document deleted successfully!');

            // Update document count after deletion
            updateDocumentCount(); 
        } else {
            alert(`Failed to delete document: ${result.message}`);
        }
    } catch (error) {
        // Handle error in deletion
        console.error('Error deleting document:', error);
        alert('An error occurred while deleting the document.');
    }
}

function updateDocumentCount() {
    // Fetch the updated document count from the backend
    fetch('http://127.0.0.1:8080/get-document-count')  // Correct port (8080)
        .then((response) => {
            if (!response.ok) {
                console.error('Network response was not ok:', response.status, response.statusText);
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then((data) => {
            if (data.success) {
                document.querySelector('#totalDocumentsCard .card-value').textContent = data.count;
            } else {
                console.error('Failed to fetch document count:', data.message);
            }
        })
        .catch((error) => {
            console.error('Error fetching document count:', error);
            alert('An error occurred while fetching the document count.');
        });
}

async function fetchDashboardData() {
    try {
        const response = await fetch('/get_dashboard_data', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.success === false) {
            console.error('Failed to load dashboard data:', data.message);
            return;
        }

        console.log('API response:', data); // Log the response to check its structure

        // Update the dashboard
        updateDashboardWithDocuments(data.total_documents, data.total_users, data.recent_activities);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
    }
}

function updateDashboardWithDocuments(totalDocuments, totalUsers, recentActivities) {
    // Update document count
    const totalDocumentsCard = document.getElementById('totalDocumentsCard');
    if (totalDocumentsCard) {
        const cardValue = totalDocumentsCard.querySelector('.card-value');
        if (cardValue) {
            cardValue.textContent = totalDocuments;
        }
    }

    // Update users count
    const totalUsersCard = document.getElementById('totalUsersCard');
    if (totalUsersCard) {
        const cardValue = totalUsersCard.querySelector('.card-value');
        if (cardValue) {
            cardValue.textContent = totalUsers;
        }
    }

    // Update recent activities
    const recentActivityList = document.getElementById('recentActivityList');
    if (recentActivityList) {
        recentActivityList.innerHTML = ''; // Clear existing activities

        // Add each recent activity as a list item
        recentActivities.forEach(activity => {
            const listItem = document.createElement('li');
            listItem.textContent = `${activity.action} (Timestamp: ${activity.timestamp})`;
            recentActivityList.appendChild(listItem);
        });
    }
}

async function fetchRecentActivity(searchTerm = '') {
    try {
        const response = await fetch('/get_activity_logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`, // Include token if required
            },
            body: JSON.stringify({ search_term: searchTerm }),
        });

        const data = await response.json();
        if (data.success) {
            renderRecentActivity(data.logs);
        } else {
            console.error('Failed to fetch recent activity:', data.error);
        }
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        alert('Failed to fetch recent activity. Please try again later.');
    }
}

function renderRecentActivity(activityLogs) {
    const recentActivityList = document.getElementById('recentActivityList');
    if (!recentActivityList) {
        console.error('Recent activity list container not found');
        return;
    }
    
    recentActivityList.innerHTML = ''; // Clear existing activity

    if (activityLogs && activityLogs.length > 0) {
        // Sort by timestamp descending and limit to top 7 recent activities
        const topActivities = activityLogs
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 7);
        topActivities.forEach(log => {
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>User ${log.user_id}</strong>: ${log.action}
                <span class="timestamp">${log.timestamp}</span>
            `;
            recentActivityList.appendChild(li);
        });
    } else {
        recentActivityList.innerHTML = '<li>No recent activity found</li>';
    }
}

// Function to fetch and render recent activities
async function fetchAndRenderRecentActivity() {
    try {
        const response = await fetch('/get_activity_logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`, // Include token if required
            },
            body: JSON.stringify({ search_term: '' }),
        });

        const data = await response.json();
        if (data.success) {
            renderRecentActivity(data.logs);
        } else {
            console.error('Failed to fetch recent activity:', data.error);
        }
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        alert('Failed to fetch recent activity. Please try again later.');
    }
}

// Call fetchAndRenderRecentActivity periodically to update the recent activities
setInterval(fetchAndRenderRecentActivity, 5000); // Update every 5 seconds

document.addEventListener('DOMContentLoaded', async function() {
    // Ensure all elements exist before accessing them
    const contentSections = document.querySelectorAll('.content-section');
    const navLinks = document.querySelectorAll('.top-nav ul li a');
    
    if (contentSections.length && navLinks.length) {
        // Initialize all necessary data
        await Promise.all([
            getAllDocuments(),
            getAllUsers(),
            loadDashboardData(),
            getAdminName(),
            fetchDashboardData(),
            fetchAndRenderRecentActivity()
        ]);

        // Setup event listeners
        setupEventListeners();
    } else {
        console.warn('Some required elements are missing from the DOM');
    }

    // Add event listeners for footer links
    const footerLinks = document.querySelectorAll('.footer-section a[data-section]');
    footerLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSectionId = link.dataset.section;
            
            // Remove active class from all sections and nav links
            const contentSections = document.querySelectorAll('.content-section');
            const navLinks = document.querySelectorAll('.top-nav ul li a');
            
            contentSections.forEach(section => section.classList.remove('active'));
            navLinks.forEach(navLink => navLink.classList.remove('active'));
            
            // Activate target section and nav link
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

function setupEventListeners() {
    // Navigation
    const navLinks = document.querySelectorAll('.top-nav ul li a');
    const contentSections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSectionId = link.dataset.section;
            switchActiveSection(targetSectionId, navLinks, contentSections);
        });
    });

    // Document upload
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadDocument);
    }

    // Activity logs
    const logSearchInput = document.getElementById('logSearch');
    const logTypeFilter = document.getElementById('logTypeFilter');
    const getLogsBtn = document.getElementById('getLogsBtn');
    if (logSearchInput && logTypeFilter) {
        logSearchInput.addEventListener('input', () => {
            filterLogs(logSearchInput.value, logTypeFilter.value);
        });
        logTypeFilter.addEventListener('change', () => {
            filterLogs(logSearchInput.value, logTypeFilter.value);
        });
    }
    if (getLogsBtn) {
        getLogsBtn.addEventListener('click', () => {
            getActivityLogs(logSearchInput.value);
        });
    }

    // Users table
    setupUserTable('usersTable', getAllUsers, 'userSearch', 1, 10, ['id', 'email', 'role']);

    // Profile dropdown
    const profileImage = document.getElementById('profileImage');
    const profileDropdown = document.getElementById('profileDropdown');

    if (profileImage) {
        profileImage.addEventListener('click', () => {
            profileDropdown.classList.toggle('show');
        });
    }

    window.addEventListener('click', (event) => {
        if (profileImage && profileDropdown && !profileImage.contains(event.target) && !profileDropdown.contains(event.target)) {
            profileDropdown.classList.remove('show');
        }
    });
}

function switchActiveSection(targetSectionId, navLinks, contentSections) {
    contentSections.forEach(section => section.classList.remove('active'));
    navLinks.forEach(navLink => navLink.classList.remove('active'));

    const targetSection = document.getElementById(targetSectionId);
    const targetLink = document.querySelector(`[data-section="${targetSectionId}"]`);
    
    if (targetSection && targetLink) {
        targetSection.classList.add('active');
        targetLink.classList.add('active');
    }
}

// Update document download function
async function downloadDocument(docId) {
    if (!docId) {
        console.error('Invalid document ID:', docId);
        alert('Cannot download document: Invalid document ID');
        return;
    }

    try {
        const response = await fetch(`/admin/document/${docId}/download`, {
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
    }
}

// Update document table population
function populateDocumentsTable(documents) {
    const tableBody = document.querySelector('#documentsTable tbody');
    if (!tableBody) {
        console.error('Documents table body not found');
        return;
    }

    console.log('Populating documents:', documents); // Debug log

    tableBody.innerHTML = '';
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No documents found</td></tr>';
        return;
    }

    documents.forEach(doc => {
        if (!doc.id) {
            console.warn('Document missing ID:', doc);
            return;
        }

        const row = document.createElement('tr');
        row.dataset.documentId = doc.id;
        
        const uploadDate = doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : 'N/A';
        
        row.innerHTML = `
            <td>${doc.id}</td>
            <td>${doc.name || 'Unnamed'}</td>
            <td>${uploadDate}</td>
            <td>${doc.user_id || 'Unknown'}</td>
            <td>
                <button type="button" class="download-btn" title="Download Document" onclick="downloadDocument(${doc.id})">
                    <i class="fas fa-download"></i>
                </button>
                <button type="button" class="delete-btn" title="Delete Document" onclick="deleteDocument(${doc.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

async function deleteDocument(docId) {
    if (!docId) {
        console.error('Invalid document ID:', docId);
        alert('Cannot delete document: Invalid document ID');
        return;
    }

    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    try {
        const response = await fetch(`/admin/document/${docId}/delete`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            // Remove the document row from UI
            const row = document.querySelector(`tr[data-document-id="${docId}"]`);
            if (row) {
                row.remove();
            }
            alert('Document deleted successfully');
            getAllDocuments(); // Refresh the documents list
            updateDocumentCount(); // Update the document count
        } else {
            throw new Error(data.error || 'Failed to delete document');
        }
    } catch (error) {
        console.error('Error deleting document:', error);
        alert('An error occurred while deleting the document: ' + error.message);
    }
}