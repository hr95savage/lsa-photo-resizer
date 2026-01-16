from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import io
import os
import base64
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

def resize_and_compress(image, target_size=(1080, 1080), max_size=5*1024*1024, crop_data=None):
    """
    Resize image to target size and compress to ensure it's under max_size.
    Uses provided crop_data if available, otherwise uses center crop.
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
    
    width, height = image.size
    target_width, target_height = target_size
    
    # Apply crop if provided
    if crop_data:
        # Crop using provided coordinates
        left = max(0, int(crop_data['x']))
        top = max(0, int(crop_data['y']))
        right = min(width, int(crop_data['x'] + crop_data['width']))
        bottom = min(height, int(crop_data['y'] + crop_data['height']))
        image = image.crop((left, top, right, bottom))
        # Resize to exact target size
        image = image.resize(target_size, Image.Resampling.LANCZOS)
    else:
        # Smart Fill: Auto-detect orientation and fill accordingly
        is_landscape = width >= height
        
        if is_landscape:
            # Landscape: Fill height, crop width (center crop horizontally)
            scale = target_height / height
            scaled_width = width * scale
            
            if scaled_width >= target_width:
                # Wide enough - crop width, use full height
                crop_width = target_width / scale
                crop_height = height
                left = (width - crop_width) / 2
                top = 0
            else:
                # Not wide enough - use full width, crop height
                crop_width = width
                crop_height = target_height / scale
                left = 0
                top = (height - crop_height) / 2
        else:
            # Portrait: Fill width, crop height (center crop vertically)
            scale = target_width / width
            scaled_height = height * scale
            
            if scaled_height >= target_height:
                # Tall enough - crop height, use full width
                crop_height = target_height / scale
                crop_width = width
                left = 0
                top = (height - crop_height) / 2
            else:
                # Not tall enough - use full height, crop width
                crop_height = height
                crop_width = target_width / scale
                left = (width - crop_width) / 2
                top = 0
        
        # Crop the image
        left = max(0, int(left))
        top = max(0, int(top))
        right = min(width, int(left + crop_width))
        bottom = min(height, int(top + crop_height))
        image = image.crop((left, top, right, bottom))
        
        # Resize to exact target size
        image = image.resize(target_size, Image.Resampling.LANCZOS)
    
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

def optimize_image(image, max_size_bytes):
    """
    Optimize image to fit within max_size_bytes while maintaining aspect ratio.
    Returns optimized image as BytesIO.
    """
    # Convert to RGB if necessary
    if image.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', image.size, (255, 255, 255))
        if image.mode == 'P':
            image = image.convert('RGBA')
        if image.mode in ('RGBA', 'LA'):
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
        image = background
    elif image.mode != 'RGB':
        image = image.convert('RGB')
    
    original_width, original_height = image.size
    aspect_ratio = original_width / original_height
    
    # Start with original size
    output = io.BytesIO()
    image.save(output, format='PNG', optimize=True)
    file_size = len(output.getvalue())
    
    # If already under max size, return as is
    if file_size <= max_size_bytes:
        output.seek(0)
        return output
    
    # Try quantizing first (less quality loss than resizing)
    if file_size > max_size_bytes:
        output = io.BytesIO()
        quantized = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        quantized = quantized.convert('RGB')
        quantized.save(output, format='PNG', optimize=True)
        file_size = len(output.getvalue())
        if file_size <= max_size_bytes:
            output.seek(0)
            return output
        image = quantized
    
    # If still too large, reduce dimensions while maintaining aspect ratio
    # Start at 90% and work down
    factor = 0.9
    while file_size > max_size_bytes and factor >= 0.3:
        new_width = int(original_width * factor)
        new_height = int(original_width * factor / aspect_ratio)
        resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        resized.save(output, format='PNG', optimize=True)
        file_size = len(output.getvalue())
        if file_size <= max_size_bytes:
            output.seek(0)
            return output
        factor -= 0.05
    
    # Final attempt: more aggressive quantization
    if file_size > max_size_bytes:
        for colors in [128, 64, 32]:
            quantized = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
            quantized = quantized.convert('RGB')
            output = io.BytesIO()
            quantized.save(output, format='PNG', optimize=True)
            file_size = len(output.getvalue())
            if file_size <= max_size_bytes:
                output.seek(0)
                return output
    
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
    
    # Get crop data from form
    crop_data_list = []
    for i in range(len(files)):
        crop_key = f'crop_{i}'
        if crop_key in request.form:
            try:
                import json
                crop_data_list.append(json.loads(request.form[crop_key]))
            except:
                crop_data_list.append(None)
        else:
            crop_data_list.append(None)
    
    for index, file in enumerate(files):
        if file and allowed_file(file.filename):
            try:
                # Read image
                image_data = file.read()
                image = Image.open(io.BytesIO(image_data))
                
                # Get crop data for this image
                crop_data = crop_data_list[index] if index < len(crop_data_list) else None
                
                # Resize and compress
                output = resize_and_compress(image, TARGET_SIZE, MAX_SIZE, crop_data)
                
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
    
    # Create a zip file in memory with all processed images
    zip_data = None
    if processed_files:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in processed_files:
                file_path = os.path.join(OUTPUT_FOLDER, file_info['processed_name'])
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        zipf.writestr(file_info['processed_name'], f.read())
        zip_buffer.seek(0)
        zip_data = base64.b64encode(zip_buffer.getvalue()).decode('utf-8')
    
    return jsonify({
        'success': True,
        'processed': len(processed_files),
        'errors': len(errors),
        'files': processed_files,
        'error_details': errors,
        'zip_data': zip_data
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
