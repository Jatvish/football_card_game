# Final Whistle — Football Card Game

Mobile-friendly realtime 1v1 football card duel. Create a room, share its six-character code, and play 12 alternating attacks from different devices. Server-authoritative gameplay, card usage limits, chemistry bonuses and a match scoreboard.

## Local
Requires Node >=20. Run `npm start` and open http://localhost:3000.

## Deployment
This repository includes a Render Blueprint (`render.yaml`). On Render, choose New → Blueprint, connect this repository and deploy the free web service. Share the resulting public `*.onrender.com` URL.

This is a test prototype. Rooms are held in memory and will be lost on process restart or inactivity. No passwords, personal accounts, or payment required.
