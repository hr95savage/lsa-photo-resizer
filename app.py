from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import io
import os
from werkzeug.utils import secure_filename
import zipfile

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'heic', 'heif'}
MAX_SIZE = 5 * 1024 * 1024  # 5MB in bytes
TARGET_SIZE = (1080, 1080)

# Create necessary directories
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resize_and_compress(image, target_size=(1080, 1080), max_size=5*1024*1024):
    """
    Resize image to target size and compress to ensure it's under max_size.
    Uses center crop to maintain square aspect ratio.
    """
    # Convert to RGB if necessary (for formats like RGBA, P, etc.)
    if image.mode in ('RGBA', 'LA', 'P'):
        # Create a white background
        background = Image.new('RGB', image.size, (255, 255, 255))
        if image.mode == 'P':
            image = image.convert('RGBA')
        if image.mode in ('RGBA', 'LA'):
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
        image = background
    elif image.mode != 'RGB':
        image = image.convert('RGB')
    
    # Calculate resize dimensions maintaining aspect ratio, then crop to square
    width, height = image.size
    target_width, target_height = target_size
    
    # Calculate scaling to cover the target size
    scale = max(target_width / width, target_height / height)
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    # Resize
    image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Center crop to exact target size
    left = (new_width - target_width) // 2
    top = (new_height - target_height) // 2
    right = left + target_width
    bottom = top + target_height
    image = image.crop((left, top, right, bottom))
    
    # Try different compression strategies
    output = io.BytesIO()
    image.save(output, format='PNG', optimize=True)
    file_size = len(output.getvalue())
    
    # If too large, try quantizing to reduce colors
    if file_size > max_size:
        output = io.BytesIO()
        # Quantize to 256 colors (8-bit palette)
        quantized = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        quantized = quantized.convert('RGB')
        quantized.save(output, format='PNG', optimize=True)
        file_size = len(output.getvalue())
        image = quantized
    
    # If still too large, reduce dimensions incrementally
    factor = 0.95
    while file_size > max_size and factor >= 0.5:
        new_size = (int(target_width * factor), int(target_height * factor))
        resized = image.resize(new_size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        resized.save(output, format='PNG', optimize=True)
        file_size = len(output.getvalue())
        if file_size <= max_size:
            break
        factor -= 0.05
    
    # Final check - if still too large, use more aggressive quantization
    if file_size > max_size:
        for colors in [128, 64, 32]:
            quantized = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
            quantized = quantized.convert('RGB')
            output = io.BytesIO()
            quantized.save(output, format='PNG', optimize=True)
            file_size = len(output.getvalue())
            if file_size <= max_size:
                break
    
    output.seek(0)
    return output

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/resize', methods=['POST'])
def resize_images():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    if not files or files[0].filename == '':
        return jsonify({'error': 'No files selected'}), 400
    
    processed_files = []
    errors = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                # Read image
                image_data = file.read()
                image = Image.open(io.BytesIO(image_data))
                
                # Resize and compress
                output = resize_and_compress(image, TARGET_SIZE, MAX_SIZE)
                
                # Save processed image
                filename = secure_filename(file.filename)
                base_name = os.path.splitext(filename)[0]
                output_filename = f"{base_name}_1080x1080.png"
                output_path = os.path.join(OUTPUT_FOLDER, output_filename)
                
                with open(output_path, 'wb') as f:
                    f.write(output.getvalue())
                
                file_size = len(output.getvalue())
                processed_files.append({
                    'original_name': filename,
                    'processed_name': output_filename,
                    'size': file_size,
                    'size_mb': round(file_size / (1024 * 1024), 2)
                })
                
            except Exception as e:
                errors.append({
                    'filename': file.filename,
                    'error': str(e)
                })
        else:
            errors.append({
                'filename': file.filename if file else 'unknown',
                'error': 'File type not allowed'
            })
    
    # Create a zip file with all processed images
    zip_path = None
    if processed_files:
        zip_path = os.path.join(OUTPUT_FOLDER, 'resized_images.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in processed_files:
                file_path = os.path.join(OUTPUT_FOLDER, file_info['processed_name'])
                zipf.write(file_path, file_info['processed_name'])
    
    return jsonify({
        'success': True,
        'processed': len(processed_files),
        'errors': len(errors),
        'files': processed_files,
        'error_details': errors,
        'zip_available': zip_path is not None
    })

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    file_path = os.path.join(OUTPUT_FOLDER, secure_filename(filename))
    if os.path.exists(file_path):
        return send_file(file_path, as_attachment=True)
    return jsonify({'error': 'File not found'}), 404

@app.route('/download-zip', methods=['GET'])
def download_zip():
    zip_path = os.path.join(OUTPUT_FOLDER, 'resized_images.zip')
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True, download_name='resized_images.zip')
    return jsonify({'error': 'Zip file not found'}), 404

@app.route('/')
def index():
    return send_file('static/index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5001)
