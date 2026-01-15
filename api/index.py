from vercel import Response

def handler(req):
    # Serve the index.html file
    try:
        with open('index.html', 'r') as f:
            html_content = f.read()
        return Response(
            html_content,
            status=200,
            headers={'Content-Type': 'text/html; charset=utf-8'}
        )
    except FileNotFoundError:
        return Response(
            'File not found',
            status=404,
            headers={'Content-Type': 'text/plain'}
        )
