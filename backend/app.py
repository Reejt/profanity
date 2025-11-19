from flask import Flask, request, jsonify
import sys
sys.path.append('..')
from detect_abuse import detect_abuse  # Adjust if function name differs

app = Flask(__name__)

@app.route('/api/detect', methods=['POST'])
def detect():
    data = request.get_json()
    text = data.get('text', '')
    result = detect_abuse(text)
    return jsonify({'result': result})

if __name__ == '__main__':
    app.run(debug=True)
