from pathlib import Path
import sys

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from detect_abuse import detect_abuse
FRONTEND_DIR = BASE_DIR / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route('/api/detect', methods=['POST'])
def detect():
    data = request.get_json()
    text = data.get('text', '')
    result = detect_abuse(text)
    return jsonify(result)


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

if __name__ == '__main__':
    app.run(debug=True)
