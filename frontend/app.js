class AbuseDetectorUI {
    constructor(container) {
        this.container = container;
        this.recognition = null;
        this.isListening = false;
        this.supportsVoice = false;
        this.finalTranscript = '';
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="title">Profanity/Abuse Detector</div>
            <textarea class="textarea" id="inputText" placeholder="Enter text or use voice..."></textarea>
            <div class="actions">
                <button class="button" id="checkBtn">Check</button>
                <button class="button mic" id="voiceBtn" type="button" aria-label="Start voice input">Voice</button>
            </div>
            <div id="voiceStatus" class="voice-status" aria-live="polite"></div>
            <div id="result" class="result"></div>
        `;
        this.bindEvents();
        this.initVoice();
    }

    bindEvents() {
        this.container.querySelector('#checkBtn').addEventListener('click', () => this.detectAbuse());
        this.container.querySelector('#voiceBtn').addEventListener('click', () => this.toggleVoice());
    }

    initVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const voiceBtn = this.container.querySelector('#voiceBtn');
        const statusEl = this.container.querySelector('#voiceStatus');

        if (!SpeechRecognition) {
            this.supportsVoice = false;
            voiceBtn.disabled = true;
            statusEl.textContent = 'Voice input is not supported in this browser. Use Chrome or Edge.';
            return;
        }

        this.supportsVoice = true;
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.continuous = false;

        this.recognition.onstart = () => {
            this.isListening = true;
            voiceBtn.textContent = 'Listening...';
            voiceBtn.classList.add('listening');
            statusEl.textContent = 'Listening. Speak now.';
            this.finalTranscript = '';
        };

        this.recognition.onresult = (event) => {
            let interim = '';

            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.finalTranscript += transcript + ' ';
                } else {
                    interim += transcript;
                }
            }

            const textArea = this.container.querySelector('#inputText');
            textArea.value = (this.finalTranscript + interim).trim();
        };

        this.recognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                statusEl.textContent = 'Microphone permission was denied. Please allow mic access and try again.';
                return;
            }
            statusEl.textContent = `Voice input error: ${event.error}.`;
        };

        this.recognition.onend = async () => {
            this.isListening = false;
            voiceBtn.textContent = 'Voice';
            voiceBtn.classList.remove('listening');
            statusEl.textContent = 'Voice input ended.';

            if (this.finalTranscript.trim()) {
                await this.detectAbuse();
            }
        };
    }

    toggleVoice() {
        if (!this.supportsVoice || !this.recognition) {
            return;
        }

        const statusEl = this.container.querySelector('#voiceStatus');

        if (this.isListening) {
            this.recognition.stop();
            statusEl.textContent = 'Stopping voice input...';
            return;
        }

        try {
            this.recognition.start();
        } catch (err) {
            statusEl.textContent = 'Unable to start voice input. Try again.';
        }
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
            const verdict = data.abusive ? 'Abusive' : 'Not abusive';
            resultDiv.textContent = `Result: ${verdict} | Top label: ${data.top_label} (${data.max_score.toFixed(3)})`;
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
