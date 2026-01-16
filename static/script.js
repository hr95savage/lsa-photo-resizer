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
let imageRect = null; // The actual rendered image area (x, y, width, height in CSS pixels)
let containerRect = null; // The container dimensions

// Detect API base URL
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001' 
    : '/api';

// File selection - with null checks
if (selectFilesBtn && fileInput) {
    selectFilesBtn.addEventListener('click', (e) => {
        try {
            fileInput.click();
        } catch (err) {
        }
    });

    fileInput.addEventListener('change', (e) => {
        try {
            handleFiles(Array.from(e.target.files));
        } catch (err) {
        }
    });
} else {
}

// Drag and drop - with null checks
if (uploadArea) {
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
} else {
}

function handleFiles(files) {
    try {
        selectedFiles = [...selectedFiles, ...files];
        updateFileList();
        showActions();
        hideError();
    } catch (err) {
        throw err;
    }
}

function updateFileList() {
    if (!fileList || !fileListItems) return;
    
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
    if (actions) actions.style.display = 'block';
}

function hideActions() {
    if (actions) actions.style.display = 'none';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Start cropping process
if (processBtn) {
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
}

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
            
            // Recalculate imageRect after a brief delay to ensure layout is complete
            setTimeout(() => {
                const container = cropCanvas.parentElement;
                const containerBounds = container.getBoundingClientRect();
                const canvasBounds = cropCanvas.getBoundingClientRect();
                
                imageRect = {
                    x: 0,
                    y: 0,
                    width: canvasBounds.width,
                    height: canvasBounds.height
                };
                
                updateCropBox();
            }, 10);
            
            // Load existing crop data if available
            if (cropData[index]) {
                cropBoxData = { ...cropData[index] };
            } else {
                // Smart Fill with 1:1 aspect ratio: Auto-detect orientation and fill accordingly
                const targetSize = 1080;
                const isLandscape = img.width >= img.height;
                
                let cropWidth, cropHeight, cropX, cropY;
                
                if (isLandscape) {
                    // Landscape: Fill height, crop width (center crop horizontally)
                    // Scale to fill height (1080px)
                    const scale = targetSize / img.height;
                    const scaledWidth = img.width * scale;
                    
                    if (scaledWidth >= targetSize) {
                        // Wide enough - crop width to square, use full height
                        cropWidth = targetSize / scale; // Convert back to original coordinates
                        cropHeight = img.height; // Use full height
                        cropX = (img.width - cropWidth) / 2; // Center horizontally
                        cropY = 0; // Start at top
                    } else {
                        // Not wide enough - use full width, crop height to square
                        cropWidth = img.width;
                        cropHeight = img.width; // Make square
                        cropX = 0;
                        cropY = (img.height - cropHeight) / 2;
                    }
                } else {
                    // Portrait: Fill width, crop height (center crop vertically)
                    // Scale to fill width (1080px)
                    const scale = targetSize / img.width;
                    const scaledHeight = img.height * scale;
                    
                    if (scaledHeight >= targetSize) {
                        // Tall enough - crop height to square, use full width
                        cropHeight = targetSize / scale; // Convert back to original coordinates
                        cropWidth = img.width; // Use full width
                        cropX = 0; // Start at left
                        cropY = (img.height - cropHeight) / 2; // Center vertically
                    } else {
                        // Not tall enough - use full height, crop width to square
                        cropHeight = img.height;
                        cropWidth = img.height; // Make square
                        cropX = (img.width - cropWidth) / 2;
                        cropY = 0;
                    }
                }
                
                // Ensure crop fits within image bounds and is square
                const minDimension = Math.min(img.width, img.height);
                cropWidth = Math.min(cropWidth, minDimension);
                cropHeight = cropWidth; // Force square
                cropX = Math.max(0, Math.min(img.width - cropWidth, cropX));
                cropY = Math.max(0, Math.min(img.height - cropHeight, cropY));
                
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
    
    // Set container size to match canvas exactly (no letterboxing)
    const container = cropCanvas.parentElement;
    container.style.width = cropCanvas.width + 'px';
    container.style.height = cropCanvas.height + 'px';
    
    // Force a reflow to ensure layout is complete
    void container.offsetHeight;
    
    // Calculate the actual image content rect
    // The canvas is drawn to fill the entire canvas element
    // imageRect represents where the image is rendered, relative to the container
    // Since container matches canvas size, imageRect = (0, 0, canvas.width, canvas.height)
    const canvasBounds = cropCanvas.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    
    // Store container dimensions
    containerRect = {
        width: containerBounds.width,
        height: containerBounds.height
    };
    
    // ImageRect: the actual rendered image area relative to container
    // Canvas fills container, so imageRect starts at (0, 0) and matches canvas size
    // Use actual rendered dimensions to account for any CSS scaling
    imageRect = {
        x: 0,
        y: 0,
        width: canvasBounds.width,
        height: canvasBounds.height
    };
    
    // Ensure overlay is positioned and sized correctly (will be updated in updateOverlay)
}

function updateCropBox() {
    if (!currentImage || !imageRect) return;
    
    // Ensure crop box remains square and doesn't exceed image dimensions (in source pixels)
    const maxSize = Math.min(currentImage.width, currentImage.height);
    cropBoxData.width = Math.min(cropBoxData.width, maxSize);
    cropBoxData.height = cropBoxData.width; // Always maintain 1:1 aspect ratio
    
    // Calculate maximum allowed position (in source pixels)
    const maxX = currentImage.width - cropBoxData.width;
    const maxY = currentImage.height - cropBoxData.height;
    
    // Clamp position to ensure entire box stays within image (source pixels)
    cropBoxData.x = Math.max(0, Math.min(maxX, cropBoxData.x));
    cropBoxData.y = Math.max(0, Math.min(maxY, cropBoxData.y));
    
    // Final validation: ensure edges don't exceed image boundaries (source pixels)
    if (cropBoxData.x + cropBoxData.width > currentImage.width) {
        cropBoxData.x = Math.max(0, currentImage.width - cropBoxData.width);
    }
    if (cropBoxData.y + cropBoxData.height > currentImage.height) {
        cropBoxData.y = Math.max(0, currentImage.height - cropBoxData.height);
    }
    
    // Ensure crop box doesn't exceed image dimensions (source pixels)
    if (cropBoxData.width > currentImage.width) {
        cropBoxData.width = currentImage.width;
        cropBoxData.x = 0;
    }
    if (cropBoxData.height > currentImage.height) {
        cropBoxData.height = currentImage.height;
        cropBoxData.y = 0;
    }
    
    // Convert from source pixels to CSS pixels (UI space)
    // Scale from original image to canvas
    const scale = imageRect.width / currentImage.width;
    
    // Calculate crop box position in CSS pixels, relative to imageRect
    const boxX = cropBoxData.x * scale;
    const boxY = cropBoxData.y * scale;
    const boxWidth = cropBoxData.width * scale;
    const boxHeight = cropBoxData.height * scale;
    
    // Clamp to imageRect bounds (in CSS pixels)
    const clampedX = Math.max(0, Math.min(imageRect.width - boxWidth, boxX));
    const clampedY = Math.max(0, Math.min(imageRect.height - boxHeight, boxY));
    const clampedWidth = Math.min(boxWidth, imageRect.width - clampedX);
    const clampedHeight = Math.min(boxHeight, imageRect.height - clampedY);
    
    // Position crop box relative to container (imageRect is at 0,0 relative to container)
    cropBox.style.left = Math.round(imageRect.x + clampedX) + 'px';
    cropBox.style.top = Math.round(imageRect.y + clampedY) + 'px';
    cropBox.style.width = Math.round(clampedWidth) + 'px';
    cropBox.style.height = Math.round(clampedHeight) + 'px';
    
    // Update overlay
    updateOverlay();
}

function updateOverlay() {
    if (!currentImage || !imageRect) return;
    
    // Overlay should only cover the imageRect area, not padding
    cropOverlay.style.width = imageRect.width + 'px';
    cropOverlay.style.height = imageRect.height + 'px';
    cropOverlay.style.left = imageRect.x + 'px';
    cropOverlay.style.top = imageRect.y + 'px';
    
    // Convert crop box from source pixels to CSS pixels
    const scale = imageRect.width / currentImage.width;
    const boxX = cropBoxData.x * scale;
    const boxY = cropBoxData.y * scale;
    const boxWidth = cropBoxData.width * scale;
    const boxHeight = cropBoxData.height * scale;
    
    // Clamp to imageRect bounds
    const clampedX = Math.max(0, Math.min(imageRect.width - boxWidth, boxX));
    const clampedY = Math.max(0, Math.min(imageRect.height - boxHeight, boxY));
    const clampedWidth = Math.min(boxWidth, imageRect.width - clampedX);
    const clampedHeight = Math.min(boxHeight, imageRect.height - clampedY);
    
    // Create overlay mask using percentages relative to imageRect
    const left = (clampedX / imageRect.width) * 100;
    const top = (clampedY / imageRect.height) * 100;
    const right = ((clampedX + clampedWidth) / imageRect.width) * 100;
    const bottom = ((clampedY + clampedHeight) / imageRect.height) * 100;
    
    cropOverlay.style.clipPath = `polygon(
        0% 0%,
        0% 100%,
        ${left}% 100%,
        ${left}% ${top}%,
        ${right}% ${top}%,
        ${right}% ${bottom}%,
        ${left}% ${bottom}%,
        ${left}% 100%,
        100% 100%,
        100% 0%
    )`;
}

// Crop box interaction
cropBox.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    
    // Get container rect for coordinate conversion
    const container = cropCanvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    
    // Convert mouse position to container-relative coordinates
    dragStart.x = e.clientX - containerRect.left;
    dragStart.y = e.clientY - containerRect.top;
    
    // Check if a handle was clicked directly
    const handle = e.target.closest('.crop-handle');
    if (handle) {
        // Determine which handle based on class name
        if (handle.classList.contains('crop-handle-nw')) {
            dragType = 'nw';
        } else if (handle.classList.contains('crop-handle-ne')) {
            dragType = 'ne';
        } else if (handle.classList.contains('crop-handle-sw')) {
            dragType = 'sw';
        } else if (handle.classList.contains('crop-handle-se')) {
            dragType = 'se';
        } else {
            dragType = 'box';
        }
    } else {
        // Check if click is near a corner (for clicking on crop box near handles)
        const rect = cropBox.getBoundingClientRect();
        const handleSize = 20;
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        
        if (localX < handleSize && localY < handleSize) {
            dragType = 'nw';
        } else if (localX > rect.width - handleSize && localY < handleSize) {
            dragType = 'ne';
        } else if (localX < handleSize && localY > rect.height - handleSize) {
            dragType = 'sw';
        } else if (localX > rect.width - handleSize && localY > rect.height - handleSize) {
            dragType = 'se';
        } else {
            dragType = 'box';
        }
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentImage || !imageRect) return;
    
    // Get container rect for coordinate conversion
    const container = cropCanvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    
    // Convert mouse position to container-relative coordinates
    const currentX = e.clientX - containerRect.left;
    const currentY = e.clientY - containerRect.top;
    
    // Convert from CSS pixels (container space) to source pixels (image space)
    // First, convert to imageRect-relative coordinates
    const imageX = currentX - imageRect.x;
    const imageY = currentY - imageRect.y;
    const startImageX = dragStart.x - imageRect.x;
    const startImageY = dragStart.y - imageRect.y;
    
    // Scale from CSS pixels to source pixels
    const scale = currentImage.width / imageRect.width;
    const deltaX = (imageX - startImageX) * scale;
    const deltaY = (imageY - startImageY) * scale;
    
    // Store original values for bounds checking (in source pixels)
    const originalX = cropBoxData.x;
    const originalY = cropBoxData.y;
    const originalWidth = cropBoxData.width;
    const originalHeight = cropBoxData.height;
    
    if (dragType === 'box') {
        // Move the entire box - allow horizontal and vertical movement
        cropBoxData.x = originalX + deltaX;
        cropBoxData.y = originalY + deltaY;
    } else {
        // Resize from corner - maintain 1:1 aspect ratio
        // Use the larger of X or Y delta to maintain square
        const delta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        const signX = deltaX >= 0 ? 1 : -1;
        const signY = deltaY >= 0 ? 1 : -1;
        
        if (dragType === 'nw') {
            // Resize from northwest corner: dragging down-right increases size
            // Average the X and Y movement for diagonal resizing
            const avgDelta = (deltaX + deltaY) / 2;
            cropBoxData.width = originalWidth - avgDelta;
            cropBoxData.height = cropBoxData.width; // Lock to square
            cropBoxData.x = originalX + (originalWidth - cropBoxData.width);
            cropBoxData.y = originalY + (originalHeight - cropBoxData.height);
        } else if (dragType === 'ne') {
            // Resize from northeast corner: dragging down-left increases size
            // For NE, dragging left (negative deltaX) or down (positive deltaY) increases size
            // When dragging down-left: deltaX is negative, deltaY is positive
            // We want: negative deltaX + positive deltaY = increase, so use (-deltaX + deltaY)
            const avgDelta = (-deltaX + deltaY) / 2;
            cropBoxData.width = originalWidth + avgDelta;
            cropBoxData.height = cropBoxData.width; // Lock to square
            cropBoxData.y = originalY + (originalHeight - cropBoxData.height);
        } else if (dragType === 'sw') {
            // Resize from southwest corner: dragging up-right increases size
            // For SW, dragging right (positive deltaX) or up (negative deltaY) increases size
            // When dragging up-right: deltaX is positive, deltaY is negative
            // We want: positive deltaX - negative deltaY = increase, so use (deltaX - deltaY)
            const avgDelta = (deltaX - deltaY) / 2;
            cropBoxData.width = originalWidth + avgDelta;
            cropBoxData.height = cropBoxData.width; // Lock to square
            cropBoxData.x = originalX + (originalWidth - cropBoxData.width);
        } else if (dragType === 'se') {
            // Resize from southeast corner: dragging up-left increases size
            const avgDelta = (-deltaX - deltaY) / 2;
            cropBoxData.width = originalWidth - avgDelta;
            cropBoxData.height = cropBoxData.width; // Lock to square
        }
    }
    
    // STRICT: Ensure crop box size never exceeds image dimensions (source pixels)
    // Also ensure it remains square
    const maxSize = Math.min(currentImage.width, currentImage.height);
    cropBoxData.width = Math.min(cropBoxData.width, maxSize);
    cropBoxData.height = cropBoxData.width; // Always maintain square
    cropBoxData.width = Math.max(1, cropBoxData.width); // Minimum 1px
    cropBoxData.height = cropBoxData.width; // Keep square
    
    // Calculate maximum allowed position based on current size (source pixels)
    const maxX = currentImage.width - cropBoxData.width;
    const maxY = currentImage.height - cropBoxData.height;
    
    // Clamp position to ensure entire box stays within image (source pixels)
    cropBoxData.x = Math.max(0, Math.min(maxX, cropBoxData.x));
    cropBoxData.y = Math.max(0, Math.min(maxY, cropBoxData.y));
    
    // Final validation: ensure right and bottom edges don't exceed image (source pixels)
    if (cropBoxData.x + cropBoxData.width > currentImage.width) {
        cropBoxData.x = currentImage.width - cropBoxData.width;
    }
    if (cropBoxData.y + cropBoxData.height > currentImage.height) {
        cropBoxData.y = currentImage.height - cropBoxData.height;
    }
    
    // One more size check to be absolutely sure (source pixels) - maintain square
    // Reuse maxSize from above (line 600)
    if (cropBoxData.width > maxSize) {
        cropBoxData.width = maxSize;
        cropBoxData.height = maxSize;
        // Center if needed
        if (cropBoxData.x + cropBoxData.width > currentImage.width) {
            cropBoxData.x = currentImage.width - cropBoxData.width;
        }
        if (cropBoxData.y + cropBoxData.height > currentImage.height) {
            cropBoxData.y = currentImage.height - cropBoxData.height;
        }
    }
    
    // Update drag start position for next move (in container coordinates)
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

if (cropPrevBtn) {
    cropPrevBtn.addEventListener('click', () => {
        // Save current crop data
        cropData[currentCropIndex] = { ...cropBoxData };
        
        // Load previous image
        if (currentCropIndex > 0) {
            loadImageForCrop(currentCropIndex - 1);
        }
    });
}

if (cropNextBtn) {
    cropNextBtn.addEventListener('click', () => {
        // Save current crop data
        cropData[currentCropIndex] = { ...cropBoxData };
        
        // Load next image
        if (currentCropIndex < selectedFiles.length - 1) {
            loadImageForCrop(currentCropIndex + 1);
        }
    });
}

if (cropFinishBtn) {
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
        
        // Check if response is ok first
        if (!response.ok) {
            let errorMessage = 'Processing failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // If we can't parse JSON, use status text
                errorMessage = response.statusText || `Server error: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        // Check if response has content
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Unexpected response format: ${text.substring(0, 200)}`);
        }
        
        // Parse JSON response
        const text = await response.text();
        if (!text || text.trim().length === 0) {
            throw new Error('Empty response from server');
        }
        
        let data;
        try {
            data = JSON.parse(text);
            // Log debug info if present
            if (data.debug) {
                console.log('Debug info from server:', data.debug);
            }
        } catch (e) {
            console.error('JSON parse error:', e, 'Response text:', text.substring(0, 500));
            throw new Error(`Invalid JSON response: ${e.message}. Response: ${text.substring(0, 200)}`);
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
        if (processBtn) processBtn.disabled = false;
    }
    });
}

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
if (downloadZipBtn) {
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
}

// Reset
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        selectedFiles = [];
        cropData = [];
        processedData = null;
        updateFileList();
        hideActions();
        hideResults();
        hideProgress();
        hideCropInterface();
        if (fileInput) fileInput.value = '';
    });
}

// Clear
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        selectedFiles = [];
        cropData = [];
        updateFileList();
        hideActions();
        hideResults();
        hideProgress();
        hideCropInterface();
        if (fileInput) fileInput.value = '';
    });
}
