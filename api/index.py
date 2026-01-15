# Vercel serverless function
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import base64
import zipfile
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'heic', 'heif'}
MAX_SIZE = 5 * 1024 * 1024
TARGET_SIZE = (1080, 1080)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resize_and_compress(image, target_size=(1080, 1080), max_size=5*1024*1024):
    if image.mode in ('RGBA', 'LA', 'P'):
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
    scale = max(target_width / width, target_height / height)
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    left = (new_width - target_width) // 2
    top = (new_height - target_height) // 2
    image = image.crop((left, top, left + target_width, top + target_height))
    
    output = io.BytesIO()
    image.save(output, format='PNG', optimize=True)
    file_size = len(output.getvalue())
    
    if file_size > max_size:
        output = io.BytesIO()
        quantized = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        quantized = quantized.convert('RGB')
        quantized.save(output, format='PNG', optimize=True)
        file_size = len(output.getvalue())
        image = quantized
    
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

@app.route('/resize', methods=['POST', 'OPTIONS'])
def resize_images():
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    if not files or files[0].filename == '':
        return jsonify({'error': 'No files selected'}), 400
    
    processed_files = []
    errors = []
    file_data_list = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                image_data = file.read()
                image = Image.open(io.BytesIO(image_data))
                output = resize_and_compress(image, TARGET_SIZE, MAX_SIZE)
                output_data = output.getvalue()
                file_size = len(output_data)
                
                filename = secure_filename(file.filename)
                base_name = os.path.splitext(filename)[0]
                output_filename = f"{base_name}_1080x1080.png"
                base64_data = base64.b64encode(output_data).decode('utf-8')
                
                processed_files.append({
                    'original_name': filename,
                    'processed_name': output_filename,
                    'size': file_size,
                    'size_mb': round(file_size / (1024 * 1024), 2),
                    'data': base64_data
                })
                
                file_data_list.append({
                    'name': output_filename,
                    'data': output_data
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
    
    zip_data = None
    if file_data_list:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_info in file_data_list:
                zipf.writestr(file_info['name'], file_info['data'])
        zip_buffer.seek(0)
        zip_data = base64.b64encode(zip_buffer.getvalue()).decode('utf-8')
    
    response = jsonify({
        'success': True,
        'processed': len(processed_files),
        'errors': len(errors),
        'files': processed_files,
        'error_details': errors,
        'zip_data': zip_data
    })
    response.headers.add('Access-Control-Allow-Origin', '*')
    return response

# Vercel requires this handler function
# The function name must be exactly 'handler'
def handler(request):
    return app(request.environ, lambda status, headers: None)
