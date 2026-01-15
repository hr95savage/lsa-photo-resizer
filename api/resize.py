from http.server import BaseHTTPRequestHandler
import json
import os
import base64
import zipfile
import io
from PIL import Image
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif', 'heic', 'heif'}
MAX_SIZE = 5 * 1024 * 1024
TARGET_SIZE = (1080, 1080)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resize_and_compress(image, target_size=(1080, 1080), max_size=5*1024*1024, crop_data=None):
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
    
    # Apply crop if provided
    if crop_data:
        left = max(0, int(crop_data['x']))
        top = max(0, int(crop_data['y']))
        right = min(width, int(crop_data['x'] + crop_data['width']))
        bottom = min(height, int(crop_data['y'] + crop_data['height']))
        image = image.crop((left, top, right, bottom))
    else:
        # Default center crop
        scale = max(target_width / width, target_height / height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        left = (new_width - target_width) // 2
        top = (new_height - target_height) // 2
        image = image.crop((left, top, left + target_width, top + target_height))
    
    # Resize to exact target size
    image = image.resize(target_size, Image.Resampling.LANCZOS)
    
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

def handler(req):
    from vercel import Response
    
    if req.method == 'OPTIONS':
        return Response(
            '',
            status=200,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        )
    
    if req.method != 'POST':
        return Response(
            json.dumps({'error': 'Method not allowed'}),
            status=405,
            headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
        )
    
    try:
        # Parse multipart form data from request
        content_type = req.headers.get('content-type', '')
        if 'multipart/form-data' not in content_type:
            return Response(
                json.dumps({'error': 'Content-Type must be multipart/form-data'}),
                status=400,
                headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
            )
        
        # For Vercel, we need to parse the multipart data
        # This is a simplified version - in production you'd use a proper multipart parser
        body = req.body if isinstance(req.body, bytes) else req.body.encode() if req.body else b''
        
        # Use Flask's request parsing if available, otherwise parse manually
        from flask import Flask, request as flask_request
        from werkzeug.formparser import parse_form_data
        
        app_temp = Flask(__name__)
        with app_temp.test_request_context(
            path=req.path,
            method=req.method,
            data=body,
            content_type=content_type
        ):
            files = flask_request.files.getlist('files')
            
            if not files or not files[0].filename:
                return Response(
                    json.dumps({'error': 'No files provided'}),
                    status=400,
                    headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
                )
            
            # Get crop data from form
            crop_data_list = []
            for i in range(len(files)):
                crop_key = f'crop_{i}'
                if crop_key in flask_request.form:
                    try:
                        crop_data_list.append(json.loads(flask_request.form[crop_key]))
                    except:
                        crop_data_list.append(None)
                else:
                    crop_data_list.append(None)
            
            processed_files = []
            errors = []
            file_data_list = []
            
            for index, file in enumerate(files):
                if file and allowed_file(file.filename):
                    try:
                        image_data = file.read()
                        image = Image.open(io.BytesIO(image_data))
                        
                        # Get crop data for this image
                        crop_data = crop_data_list[index] if index < len(crop_data_list) else None
                        
                        output = resize_and_compress(image, TARGET_SIZE, MAX_SIZE, crop_data)
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
            
            return Response(
                json.dumps({
                    'success': True,
                    'processed': len(processed_files),
                    'errors': len(errors),
                    'files': processed_files,
                    'error_details': errors,
                    'zip_data': zip_data
                }),
                status=200,
                headers={
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            )
    
    except Exception as e:
        return Response(
            json.dumps({'error': str(e)}),
            status=500,
            headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
        )
