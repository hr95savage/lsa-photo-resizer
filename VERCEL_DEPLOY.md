# Deploying to Vercel

This guide will help you deploy the LSA Photo Resizer to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Vercel CLI installed (optional, for CLI deployment):
   ```bash
   npm i -g vercel
   ```

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub, GitLab, or Bitbucket**

2. **Go to [vercel.com/new](https://vercel.com/new)**

3. **Import your repository**
   - Select your repository
   - Vercel will automatically detect the Python project

4. **Configure the project**
   - Framework Preset: Other
   - Root Directory: `./` (leave as default)
   - Build Command: (leave empty - Vercel handles Python automatically)
   - Output Directory: (leave empty)
   - Install Command: `pip install -r requirements.txt`

5. **Add Environment Variables** (if needed)
   - None required for this project

6. **Click Deploy**

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **For production deployment**:
   ```bash
   vercel --prod
   ```

## Project Structure for Vercel

The project is configured with:
- `vercel.json` - Vercel configuration file
- `api/index.py` - Serverless function handler
- `static/` - Static files (HTML, CSS, JS)
- `requirements.txt` - Python dependencies

## Important Notes

1. **File Size Limits**: Vercel serverless functions have a 50MB response limit. The app processes images in memory and returns them as base64-encoded data.

2. **Timeout**: Vercel free tier has a 10-second timeout for serverless functions. For processing many large images, consider:
   - Processing fewer images per request
   - Using Vercel Pro for longer timeouts

3. **Static Files**: Static files (HTML, CSS, JS) are served directly by Vercel.

4. **API Routes**: The `/api/resize` endpoint is handled by the serverless function.

## Testing Locally with Vercel

You can test the Vercel configuration locally:

```bash
vercel dev
```

This will start a local server that mimics Vercel's environment.

## Troubleshooting

### Build Errors
- Ensure `requirements.txt` includes all dependencies
- Check that Python version is compatible (Vercel uses Python 3.9+)

### Runtime Errors
- Check Vercel function logs in the dashboard
- Ensure file uploads don't exceed Vercel's limits
- Verify CORS headers are set correctly

### Static Files Not Loading
- Check `vercel.json` routes configuration
- Ensure files are in the `static/` directory

## Custom Domain

After deployment, you can add a custom domain:
1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain

## Environment Variables

If you need to add environment variables:
1. Go to project settings
2. Navigate to "Environment Variables"
3. Add your variables
4. Redeploy the project

## Support

For Vercel-specific issues, check:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Python Runtime](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/python)
