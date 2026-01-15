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

// Cropping elements
const cropContainer = document.getElementById('cropContainer');
const cropCanvas = document.getElementById('cropCanvas');
const cropOverlay = document.getElementById('cropOverlay');
const cropBox = document.getElementById('cropBox');
const cropTitle = document.getElementById('cropTitle');
const cropCounter = document.getElementById('cropCounter');
const cropTotal = document.getElementById('cropTotal');
const cropPrevBtn = document.getElementById('cropPrevBtn');
const cropNextBtn = document.getElementById('cropNextBtn');
const cropFinishBtn = document.getElementById('cropFinishBtn');

let selectedFiles = [];
let processedData = null;
let cropData = []; // Store crop coordinates for each image
let currentCropIndex = 0;
let currentImage = null;
let cropBoxData = { x: 0, y: 0, width: 1080, height: 1080 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragType = null; // 'box', 'nw', 'ne', 'sw', 'se'

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
            cropData.splice(index, 1);
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

// Start cropping process
processBtn.addEventListener('click', () => {
    if (selectedFiles.length === 0) {
        showError('Please select at least one file');
        return;
    }
    
    // Initialize crop data array
    cropData = selectedFiles.map(() => null);
    currentCropIndex = 0;
    
    // Hide other UI elements
    hideActions();
    hideError();
    hideResults();
    hideProgress();
    
    // Show cropping interface
    showCropInterface();
    loadImageForCrop(0);
});

function showCropInterface() {
    cropContainer.style.display = 'block';
    cropTotal.textContent = selectedFiles.length;
    updateCropButtons();
}

function hideCropInterface() {
    cropContainer.style.display = 'none';
}

function loadImageForCrop(index) {
    if (index < 0 || index >= selectedFiles.length) return;
    
    currentCropIndex = index;
    cropCounter.textContent = index + 1;
    
    const file = selectedFiles[index];
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            setupCropCanvas(img);
            
            // Load existing crop data if available
            if (cropData[index]) {
                cropBoxData = { ...cropData[index] };
            } else {
                // Initialize with center crop
                const scale = Math.min(cropCanvas.width / img.width, cropCanvas.height / img.height);
                const displayWidth = img.width * scale;
                const displayHeight = img.height * scale;
                const offsetX = (cropCanvas.width - displayWidth) / 2;
                const offsetY = (cropCanvas.height - displayHeight) / 2;
                
                // Calculate crop box in image coordinates
                const targetSize = 1080;
                const imageScale = Math.max(targetSize / img.width, targetSize / img.height);
                const cropWidth = targetSize / imageScale;
                const cropHeight = targetSize / imageScale;
                const cropX = (img.width - cropWidth) / 2;
                const cropY = (img.height - cropHeight) / 2;
                
                cropBoxData = {
                    x: cropX,
                    y: cropY,
                    width: cropWidth,
                    height: cropHeight
                };
            }
            
            updateCropBox();
            updateCropButtons();
        };
        img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

function setupCropCanvas(img) {
    const maxWidth = 800;
    const maxHeight = 600;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    
    cropCanvas.width = img.width * scale;
    cropCanvas.height = img.height * scale;
    
    const ctx = cropCanvas.getContext('2d');
    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
    
    // Set container size to match canvas exactly
    const container = cropCanvas.parentElement;
    container.style.width = cropCanvas.width + 'px';
    container.style.height = cropCanvas.height + 'px';
    
    // Ensure overlay matches canvas size exactly
    cropOverlay.style.width = cropCanvas.width + 'px';
    cropOverlay.style.height = cropCanvas.height + 'px';
}

function updateCropBox() {
    if (!currentImage) return;
    
    const scale = cropCanvas.width / currentImage.width;
    const boxX = cropBoxData.x * scale;
    const boxY = cropBoxData.y * scale;
    const boxWidth = cropBoxData.width * scale;
    const boxHeight = cropBoxData.height * scale;
    
    cropBox.style.left = boxX + 'px';
    cropBox.style.top = boxY + 'px';
    cropBox.style.width = boxWidth + 'px';
    cropBox.style.height = boxHeight + 'px';
    
    // Update overlay
    updateOverlay();
}

function updateOverlay() {
    if (!currentImage) return;
    
    const scale = cropCanvas.width / currentImage.width;
    const boxX = cropBoxData.x * scale;
    const boxY = cropBoxData.y * scale;
    const boxWidth = cropBoxData.width * scale;
    const boxHeight = cropBoxData.height * scale;
    
    // Ensure overlay size matches canvas
    cropOverlay.style.width = cropCanvas.width + 'px';
    cropOverlay.style.height = cropCanvas.height + 'px';
    
    // Create overlay mask using exact pixel values converted to percentages
    const canvasWidth = cropCanvas.width;
    const canvasHeight = cropCanvas.height;
    
    cropOverlay.style.clipPath = `polygon(
        0% 0%,
        0% 100%,
        ${(boxX / canvasWidth) * 100}% 100%,
        ${(boxX / canvasWidth) * 100}% ${(boxY / canvasHeight) * 100}%,
        ${((boxX + boxWidth) / canvasWidth) * 100}% ${(boxY / canvasHeight) * 100}%,
        ${((boxX + boxWidth) / canvasWidth) * 100}% ${((boxY + boxHeight) / canvasHeight) * 100}%,
        ${(boxX / canvasWidth) * 100}% ${((boxY + boxHeight) / canvasHeight) * 100}%,
        ${(boxX / canvasWidth) * 100}% 100%,
        100% 100%,
        100% 0%
    )`;
}

// Crop box interaction
cropBox.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    
    const canvasRect = cropCanvas.getBoundingClientRect();
    dragStart.x = e.clientX - canvasRect.left;
    dragStart.y = e.clientY - canvasRect.top;
    
    const rect = cropBox.getBoundingClientRect();
    const handleSize = 20;
    
    // Check which handle was clicked
    if (e.offsetX < handleSize && e.offsetY < handleSize) {
        dragType = 'nw';
    } else if (e.offsetX > rect.width - handleSize && e.offsetY < handleSize) {
        dragType = 'ne';
    } else if (e.offsetX < handleSize && e.offsetY > rect.height - handleSize) {
        dragType = 'sw';
    } else if (e.offsetX > rect.width - handleSize && e.offsetY > rect.height - handleSize) {
        dragType = 'se';
    } else {
        dragType = 'box';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentImage) return;
    
    const canvasRect = cropCanvas.getBoundingClientRect();
    const currentX = e.clientX - canvasRect.left;
    const currentY = e.clientY - canvasRect.top;
    
    const scale = cropCanvas.width / currentImage.width;
    const deltaX = (currentX - dragStart.x) / scale;
    const deltaY = (currentY - dragStart.y) / scale;
    
    if (dragType === 'box') {
        cropBoxData.x = Math.max(0, Math.min(currentImage.width - cropBoxData.width, cropBoxData.x + deltaX));
        cropBoxData.y = Math.max(0, Math.min(currentImage.height - cropBoxData.height, cropBoxData.y + deltaY));
    } else if (dragType === 'nw') {
        const newWidth = cropBoxData.width - deltaX;
        const newHeight = cropBoxData.height - deltaY;
        const size = Math.min(newWidth, newHeight);
        cropBoxData.x = Math.max(0, cropBoxData.x + (cropBoxData.width - size));
        cropBoxData.y = Math.max(0, cropBoxData.y + (cropBoxData.height - size));
        cropBoxData.width = size;
        cropBoxData.height = size;
    } else if (dragType === 'ne') {
        const newWidth = cropBoxData.width + deltaX;
        const newHeight = cropBoxData.height - deltaY;
        const size = Math.min(newWidth, newHeight);
        cropBoxData.y = Math.max(0, cropBoxData.y + (cropBoxData.height - size));
        cropBoxData.width = size;
        cropBoxData.height = size;
    } else if (dragType === 'sw') {
        const newWidth = cropBoxData.width - deltaX;
        const newHeight = cropBoxData.height + deltaY;
        const size = Math.min(newWidth, newHeight);
        cropBoxData.x = Math.max(0, cropBoxData.x + (cropBoxData.width - size));
        cropBoxData.width = size;
        cropBoxData.height = size;
    } else if (dragType === 'se') {
        const newWidth = cropBoxData.width + deltaX;
        const newHeight = cropBoxData.height + deltaY;
        const size = Math.min(newWidth, newHeight);
        cropBoxData.width = size;
        cropBoxData.height = size;
    }
    
    // Ensure crop box stays within image bounds
    cropBoxData.x = Math.max(0, Math.min(currentImage.width - cropBoxData.width, cropBoxData.x));
    cropBoxData.y = Math.max(0, Math.min(currentImage.height - cropBoxData.height, cropBoxData.y));
    cropBoxData.width = Math.min(cropBoxData.width, currentImage.width - cropBoxData.x);
    cropBoxData.height = Math.min(cropBoxData.height, currentImage.height - cropBoxData.y);
    
    // Maintain square aspect ratio
    const minSize = Math.min(cropBoxData.width, cropBoxData.height);
    cropBoxData.width = minSize;
    cropBoxData.height = minSize;
    
    // Update drag start position for next move
    dragStart.x = currentX;
    dragStart.y = currentY;
    
    updateCropBox();
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    dragType = null;
});

function updateCropButtons() {
    cropPrevBtn.style.display = currentCropIndex > 0 ? 'inline-block' : 'none';
    cropNextBtn.style.display = currentCropIndex < selectedFiles.length - 1 ? 'inline-block' : 'none';
    cropFinishBtn.style.display = currentCropIndex === selectedFiles.length - 1 ? 'inline-block' : 'none';
}

cropPrevBtn.addEventListener('click', () => {
    // Save current crop data
    cropData[currentCropIndex] = { ...cropBoxData };
    
    // Load previous image
    if (currentCropIndex > 0) {
        loadImageForCrop(currentCropIndex - 1);
    }
});

cropNextBtn.addEventListener('click', () => {
    // Save current crop data
    cropData[currentCropIndex] = { ...cropBoxData };
    
    // Load next image
    if (currentCropIndex < selectedFiles.length - 1) {
        loadImageForCrop(currentCropIndex + 1);
    }
});

cropFinishBtn.addEventListener('click', async () => {
    // Save current crop data
    cropData[currentCropIndex] = { ...cropBoxData };
    
    // Hide cropping interface
    hideCropInterface();
    
    // Show progress
    showProgress();
    processBtn.disabled = true;
    
    // Process images with crop data
    try {
        progressText.textContent = 'Processing images with your crops...';
        progressFill.style.width = '30%';
        
        const formData = new FormData();
        selectedFiles.forEach((file, index) => {
            formData.append('files', file);
            if (cropData[index]) {
                formData.append(`crop_${index}`, JSON.stringify(cropData[index]));
            }
        });
        
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
        
        processedData = data;
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
    if (!processedData) {
        showError('No processed files available for download');
        return;
    }
    
    // Check if we have zip_data
    if (processedData.zip_data) {
        try {
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
        } catch (error) {
            console.error('Download error:', error);
            showError(`Download failed: ${error.message}`);
        }
    } else if (processedData.files && processedData.files.length > 0) {
        // Fallback: download individual files if zip is not available
        processedData.files.forEach((file, index) => {
            try {
                const fileBytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
                const blob = new Blob([fileBytes], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.processed_name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // Add small delay between downloads
                if (index < processedData.files.length - 1) {
                    setTimeout(() => {}, 100);
                }
            } catch (error) {
                console.error('File download error:', error);
            }
        });
    } else {
        showError('No processed files available for download');
    }
});

// Reset
resetBtn.addEventListener('click', () => {
    selectedFiles = [];
    cropData = [];
    updateFileList();
    hideActions();
    hideResults();
    hideProgress();
    hideCropInterface();
    fileInput.value = '';
});

// Clear
clearBtn.addEventListener('click', () => {
    selectedFiles = [];
    cropData = [];
    updateFileList();
    hideActions();
    hideResults();
    hideProgress();
    hideCropInterface();
    fileInput.value = '';
});
