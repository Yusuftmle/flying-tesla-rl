"""
Simülasyon Başlatıcı (3D Ball Balancing Web App)
Yerel HTTP sunucusu başlatır ve varsayılan tarayıcınızda index.html'i açar.
"""

import os
import sys
import webbrowser
import http.server
import socketserver

PORT = 8080
DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    os.chdir(DIRECTORY)
    url = f"http://localhost:{PORT}/web/index.html"
    print("=" * 60)
    print(" 🎯 REINFORCEMENT LEARNING - 3D BALL BALANCING SIMULATION")
    print(f" Sunucu adresi: {url}")
    print(" Çıkmak için konsolda Ctrl+C tuşlarına basabilirsiniz.")
    print("=" * 60)

    webbrowser.open(url)

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSunucu kapatıldı.")

if __name__ == "__main__":
    main()
