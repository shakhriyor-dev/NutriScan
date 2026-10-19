# NutriScan

Modern barcode nutrition scanner built with HTML, CSS, vanilla JavaScript, Express and Socket.IO.

## Features

- Responsive nutrition dashboard
- Desktop-to-phone pairing with QR code
- Phone/tablet uses its own camera without pairing
- Barcode scanning with ZXing browser library
- Product lookup through Open Food Facts API
- Calories, protein, fat, carbohydrates, fibre, sugars, saturated fat and salt when available
- Recent scan history stored in localStorage
- Dark/light theme
- Manual barcode entry

## Requirements

- Node.js 18 or newer
- A modern browser
- Internet access for the CDN libraries and Open Food Facts API
- Camera access requires HTTPS, except `localhost`

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on your computer.

## Test phone pairing on the same Wi-Fi

1. Find your computer's local IP address.
   - Windows: run `ipconfig` and look for the IPv4 address, e.g. `192.168.1.25`.
   - macOS: check Network settings.
2. Start the server with `npm start`.
3. On the computer, open `http://192.168.1.25:3000` using your actual IP address instead of the example.
4. Open the same address on your phone. For camera access on phones, a deployed HTTPS address is usually easiest; local LAN addresses are not always treated as secure contexts.
5. The desktop view shows a QR code. Scan it with your phone. The phone page opens with a pairing code.
6. Allow camera access and scan a barcode. The product details should appear on the desktop.

Both devices must be able to reach the same server. If using a local network, allow Node.js through the firewall if prompted. Do not expose a development server to the public internet without appropriate security and deployment configuration.

## Deploy

Deploy the Node.js app to a host that supports persistent WebSocket connections and HTTPS. Set the port using the `PORT` environment variable if required. Open the deployed HTTPS URL on the desktop and scan the QR code with the phone.

Static-only hosting such as GitHub Pages cannot run this project's `server.js` pairing server. It can host a mobile-only version, but cross-device pairing needs a backend or a real-time service.

## Notes and limitations

- Open Food Facts data is community-contributed; not every barcode has a complete or accurate record.
- Missing nutrients display as `—`, not zero.
- Always check the product packaging for authoritative allergen and nutrition information.
- This is a portfolio starter, not a medical or dietary recommendation service.
- The pairing session token is intended for a demo. For a public production deployment, add rate limits, expiry, stronger session management and origin/security controls.
- Desktop/mobile detection is a practical heuristic. It uses user-agent hints and screen width; unusual devices or resized windows may need a manual mode override.
- Barcode scanning uses a CDN library and therefore needs internet access. For production, consider bundling dependencies locally.
