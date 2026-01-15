# LSA Photo Resizer

A web-based photo resizer that allows you to upload multiple photos at once and automatically resize them to 1080×1080 PNG format, ensuring each file is under 5MB.

## Features

- 📤 **Batch Upload**: Upload multiple photos at once
- 🖼️ **Format Support**: Accepts PNG, JPG, JPEG, GIF, BMP, WEBP, TIFF, HEIC, and more
- 📐 **Auto Resize**: Automatically resizes to 1080×1080 pixels
- 🎨 **Smart Compression**: Ensures output files are under 5MB
- 📦 **ZIP Download**: Download all processed images as a single ZIP file
- 🎯 **Center Crop**: Maintains aspect ratio with intelligent center cropping
- 💻 **Modern UI**: Beautiful, responsive interface with drag-and-drop support

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the application:**
   ```bash
   python app.py
   ```

3. **Open your browser:**
   Navigate to `http://localhost:5001`

## Usage

1. **Upload Photos:**
   - Drag and drop photos onto the upload area, or
   - Click "Select Files" to choose photos from your computer

2. **Process Images:**
   - Click "Process Images" to start resizing
   - Wait for processing to complete

3. **Download Results:**
   - Click "Download All as ZIP" to get all processed images
   - Each image will be named `originalname_1080x1080.png`

## How It Works

- Images are resized to 1080×1080 pixels using center crop to maintain square aspect ratio
- Images are converted to PNG format
- If the file size exceeds 5MB, the app automatically:
  - Reduces color palette (quantization)
  - Reduces dimensions incrementally if needed
  - Applies PNG optimization

## Technical Details

- **Backend**: Flask (Python)
- **Image Processing**: Pillow (PIL)
- **Frontend**: Vanilla JavaScript with modern CSS
- **Port**: 5001 (default, 5000 is used by AirPlay on macOS)
- **Deployment**: Can be deployed to Vercel (see VERCEL_DEPLOY.md)

## File Structure

```
LSA Photo Resizer/
├── app.py              # Flask backend server
├── requirements.txt    # Python dependencies
├── README.md          # This file
├── static/
│   ├── index.html     # Frontend HTML
│   ├── style.css      # Styling
│   └── script.js      # Frontend JavaScript
├── uploads/           # Temporary upload folder (auto-created)
└── output/            # Processed images folder (auto-created)
```

## Notes

- Processed images are saved in the `output/` folder
- A ZIP file containing all processed images is created after processing
- The app handles various image formats and color modes automatically
- Transparent images are converted to RGB with white background
