const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const fileList = document.getElementById('fileList');
const fileListItems = document.getElementById('fileListItems');
const actions = document.getElementById('actions');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const results = document.getElementById('results');
const resultsInfo = document.getElementById('resultsInfo');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const resetBtn = document.getElementById('resetBtn');
const errorMessage = document.getElementById('errorMessage');

let selectedFiles = [];
let processedData = null; // Store processed data for downloads

// Detect API base URL
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001' 
    : '/api';

// File selection
selectFilesBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    handleFiles(files);
});

function handleFiles(files) {
    selectedFiles = [...selectedFiles, ...files];
    updateFileList();
    showActions();
    hideError();
}

function updateFileList() {
    if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }

    fileList.style.display = 'block';
    fileListItems.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const li = document.createElement('li');
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = file.name;

        const fileSize = document.createElement('span');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(file.size);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.className = 'btn-secondary';
        removeBtn.style.padding = '5px 10px';
        removeBtn.style.marginLeft = '10px';
        removeBtn.onclick = () => {
            selectedFiles.splice(index, 1);
            updateFileList();
            if (selectedFiles.length === 0) {
                hideActions();
            }
        };

        li.appendChild(fileName);
        li.appendChild(fileSize);
        li.appendChild(removeBtn);
        fileListItems.appendChild(li);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showActions() {
    actions.style.display = 'block';
}

function hideActions() {
    actions.style.display = 'none';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Process images
processBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        showError('Please select at least one file');
        return;
    }

    processBtn.disabled = true;
    hideError();
    hideResults();
    showProgress();

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        progressText.textContent = 'Uploading and processing images...';
        progressFill.style.width = '30%';

        const response = await fetch(`${API_BASE}/resize`, {
            method: 'POST',
            body: formData
        });

        progressFill.style.width = '70%';
        progressText.textContent = 'Finalizing...';

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Processing failed');
        }

        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';

        processedData = data; // Store for downloads
        setTimeout(() => {
            showResults(data);
        }, 500);

    } catch (error) {
        showError(`Error: ${error.message}`);
        hideProgress();
        processBtn.disabled = false;
    }
});

function showProgress() {
    progressContainer.style.display = 'block';
    progressFill.style.width = '10%';
}

function hideProgress() {
    progressContainer.style.display = 'none';
}

function showResults(data) {
    hideProgress();
    results.style.display = 'block';

    let html = `<p class="success">✓ Successfully processed ${data.processed} image(s)</p>`;
    
    if (data.files && data.files.length > 0) {
        html += '<h4 style="margin-top: 20px; margin-bottom: 10px;">Processed Files:</h4>';
        html += '<ul style="list-style: none; padding: 0;">';
        data.files.forEach(file => {
            html += `<li style="padding: 8px; background: #f0f0f0; margin: 5px 0; border-radius: 5px;">
                ${file.processed_name} - ${file.size_mb} MB
            </li>`;
        });
        html += '</ul>';
    }

    if (data.errors > 0) {
        html += `<p class="error" style="margin-top: 15px;">⚠ ${data.errors} file(s) had errors</p>`;
        if (data.error_details && data.error_details.length > 0) {
            html += '<ul style="list-style: none; padding: 0; margin-top: 10px;">';
            data.error_details.forEach(err => {
                html += `<li style="color: #c33; padding: 5px 0;">${err.filename}: ${err.error}</li>`;
            });
            html += '</ul>';
        }
    }

    resultsInfo.innerHTML = html;
    processBtn.disabled = false;
}

function hideResults() {
    results.style.display = 'none';
}

// Download ZIP
downloadZipBtn.addEventListener('click', () => {
    if (!processedData || !processedData.zip_data) {
        showError('No processed files available for download');
        return;
    }
    
    // Convert base64 to blob and download
    const zipBytes = Uint8Array.from(atob(processedData.zip_data), c => c.charCodeAt(0));
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resized_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Reset
resetBtn.addEventListener('click', () => {
    selectedFiles = [];
    updateFileList();
    hideActions();
    hideResults();
    hideProgress();
    fileInput.value = '';
});

// Clear
clearBtn.addEventListener('click', () => {
    selectedFiles = [];
    updateFileList();
    hideActions();
    hideResults();
    hideProgress();
    fileInput.value = '';
});
