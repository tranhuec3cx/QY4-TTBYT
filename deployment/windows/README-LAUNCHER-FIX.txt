Launcher fix verification note (2026-09-05)

Expected behavior after pulling latest feature/lcm-vong-doi:
1. START-QY4-TTBYT.cmd opens admin port 5000.
2. START-QY4-TTBYT.cmd opens incident gateway port 5050 bound to 127.0.0.1.
3. START-QY4-TTBYT.cmd opens ngrok tunnel for 5050 only.
4. Browser opens tickets.html only after port 5000 is ready.
