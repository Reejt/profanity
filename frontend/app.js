class AbuseDetectorUI {
    constructor(container) {
        this.container = container;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="title">Profanity/Abuse Detector</div>
            <textarea class="textarea" id="inputText" placeholder="Enter text..."></textarea>
            <button class="button" id="checkBtn">Check</button>
            <div id="result" class="result"></div>
        `;
        this.bindEvents();
    }

    bindEvents() {
        this.container.querySelector('#checkBtn').addEventListener('click', () => this.detectAbuse());
    }

    async detectAbuse() {
        const text = this.container.querySelector('#inputText').value;
        const resultDiv = this.container.querySelector('#result');
        resultDiv.className = 'result';
        resultDiv.textContent = 'Checking...';
        try {
            const response = await fetch('/api/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
            resultDiv.textContent = 'Result: ' + data.result;
        } catch (err) {
            resultDiv.className = 'result error';
            resultDiv.textContent = 'Error contacting backend.';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.className = 'container';
    document.body.appendChild(container);
    new AbuseDetectorUI(container);
});
