# AI Quant Trading Tool H5 Demo

Mobile-first static SPA demo for:

- Signals -> Proof (backtest vs live/paper) -> Risk controls -> Velocity index
- Non-custodial positioning statement and compliance modal
- Fully mock-data driven (no backend)

## Stack

- React + Vite (static build output)
- Chart.js (`react-chartjs-2`) for equity curve
- Mock JSON files in `public/mock`
- localStorage watchlist support

## Run

```bash
npm install
npm run dev
npm run build
```

Build output is generated under `dist/` as pure static assets.

## Mock Data

- `public/mock/signals.json`
- `public/mock/performance.json`
- `public/mock/trades.json`
- `public/mock/velocity.json`
- `public/mock/config.json`
- `public/mock/performance-report.pdf`

## Deployment (China-friendly)

### Option A: Nginx static host

1. Upload `dist/` to server path, for example `/var/www/quant-demo`.
2. Nginx example:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/quant-demo;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### Option B: OSS/COS + CDN

1. Upload all files in `dist/` to bucket root.
2. Set default index document to `index.html`.
3. Enable SPA fallback to `index.html` for unknown paths (if your CDN control panel provides routing rules).

## Notes

- The app uses bundled mock files and runs without backend services.
- PDF download is static demo report (`performance-report.pdf`).
- CSV download is generated client-side from `trades.json`.
