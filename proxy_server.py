#!/usr/bin/env python3
"""
お好み焼きDB - ローカル開発用プロキシサーバー
ホットペッパーAPIのCORS問題を回避するためのプロキシエンドポイント付き
"""
import http.server
import urllib.request
import json
import os
import sys

PORT = 8080
WEBAPP_DIR = os.path.dirname(os.path.abspath(__file__))

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEBAPP_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/hotpepper'):
            self.proxy_hotpepper()
        else:
            super().do_GET()

    def proxy_hotpepper(self):
        query = ''
        if '?' in self.path:
            query = self.path.split('?', 1)[1]

        api_url = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?' + query

        try:
            req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def log_message(self, fmt, *args):
        sys.stdout.write(self.log_date_time_string() + ' ' + (fmt % args) + '\n')
        sys.stdout.flush()

if __name__ == '__main__':
    os.chdir(WEBAPP_DIR)
    with http.server.HTTPServer(('0.0.0.0', PORT), ProxyHandler) as httpd:
        print('Serving ' + WEBAPP_DIR + ' on port ' + str(PORT))
        print('Proxy: /api/hotpepper -> webservice.recruit.co.jp')
        sys.stdout.flush()
        httpd.serve_forever()
