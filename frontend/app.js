class AbuseDetectorUI {
    constructor(container) {
        this.container = container;
        this.recognition = null;
        this.isListening = false;
        this.supportsVoice = false;
        this.finalTranscript = '';
        this.isCapturingTabAudio = false;
        this.displayStream = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.audioMuteNode = null;
        this.recordedChunks = [];
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="header">
                <div class="eyebrow">Safety AI</div>
                <h1 class="title">Profanity and Abuse Detector</h1>
                <p class="subtitle">Type text, use your microphone, or share a tab. The browser asks for permission before audio can be transcribed.</p>
            </div>

            <div class="input-wrap">
                <textarea class="textarea" id="inputText" placeholder="Type or speak a message..."></textarea>
                <div class="meta-row">
                    <span id="charCount">0 characters</span>
                    <span class="hint">Press Check Text to run analysis</span>
                </div>
            </div>

            <div class="actions">
                <button class="button" id="checkBtn" type="button">Check Text</button>
                <button class="button mic" id="voiceBtn" type="button" aria-label="Start voice input">Use Microphone</button>
                <button class="button secondary" id="tabAudioBtn" type="button" aria-label="Share a tab to capture audio">Share Tab Audio</button>
            </div>
            <div id="voiceStatus" class="voice-status" aria-live="polite"></div>
            <div id="audioStatus" class="voice-status" aria-live="polite"></div>

            <div class="output-panel">
                <div class="output-label">Analysis</div>
                <div class="result-grid" aria-live="polite">
                    <div class="result-item">
                        <div class="result-key">Verdict</div>
                        <div id="resultVerdict" class="result-value">Waiting for input</div>
                    </div>
                </div>
                <div id="result" class="result-note"></div>
            </div>
        `;
        this.bindEvents();
        this.initVoice();
        this.updateCharCount();
    }

    bindEvents() {
        this.container.querySelector('#checkBtn').addEventListener('click', () => this.detectAbuse());
        this.container.querySelector('#voiceBtn').addEventListener('click', () => this.toggleVoice());
        this.container.querySelector('#tabAudioBtn').addEventListener('click', () => this.toggleTabAudioCapture());
        this.container.querySelector('#inputText').addEventListener('input', () => this.updateCharCount());
    }

    updateCharCount() {
        const text = this.container.querySelector('#inputText').value;
        this.container.querySelector('#charCount').textContent = `${text.length} character${text.length === 1 ? '' : 's'}`;
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

    setResultText(text, isError = false) {
        const resultDiv = this.container.querySelector('#result');
        resultDiv.className = isError ? 'result-note error' : 'result-note';
        resultDiv.textContent = text;

        if (isError) {
            this.container.querySelector('#resultVerdict').textContent = 'Error';
            this.container.querySelector('#resultVerdict').className = 'result-value verdict-bad';
        }
    }

    setResultSummary(verdict, isAbusive) {
        const verdictEl = this.container.querySelector('#resultVerdict');

        verdictEl.textContent = verdict;
        verdictEl.className = isAbusive ? 'result-value verdict-bad' : 'result-value verdict-good';
    }

    async toggleTabAudioCapture() {
        if (this.isCapturingTabAudio) {
            await this.stopTabAudioCapture(true);
            return;
        }

        await this.startTabAudioCapture();
    }

    async startTabAudioCapture() {
        const audioStatus = this.container.querySelector('#audioStatus');
        const tabAudioBtn = this.container.querySelector('#tabAudioBtn');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            audioStatus.textContent = 'Tab sharing is not supported in this browser. Use Chrome or Edge.';
            this.container.querySelector('#tabAudioBtn').disabled = true;
            return;
        }

        try {
            audioStatus.textContent = 'Opening the browser permission dialog. Choose the tab that is playing audio and allow sharing.';
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            this.displayStream = stream;
            this.recordedChunks = [];
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioSource = this.audioContext.createMediaStreamSource(stream);
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.audioMuteNode = this.audioContext.createGain();
            this.audioMuteNode.gain.value = 0;

            this.audioProcessor.onaudioprocess = (event) => {
                if (!this.isCapturingTabAudio) {
                    return;
                }

                const inputBuffer = event.inputBuffer;
                const channelCount = Math.max(1, inputBuffer.numberOfChannels);
                const mixedSamples = new Float32Array(inputBuffer.length);

                for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
                    const channelData = inputBuffer.getChannelData(channelIndex);
                    for (let i = 0; i < channelData.length; i += 1) {
                        mixedSamples[i] += channelData[i] / channelCount;
                    }
                }

                this.recordedChunks.push(mixedSamples);
            };

            this.audioSource.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioMuteNode);
            this.audioMuteNode.connect(this.audioContext.destination);

            this.isCapturingTabAudio = true;
            tabAudioBtn.textContent = 'Stop Sharing';
            tabAudioBtn.classList.add('listening');
            audioStatus.textContent = 'Capturing shared tab audio. Use Stop Sharing when finished.';

            stream.getTracks().forEach((track) => {
                track.addEventListener('ended', () => {
                    if (this.isCapturingTabAudio) {
                        this.stopTabAudioCapture(true);
                    }
                });
            });
        } catch (error) {
            audioStatus.textContent = 'Tab sharing was cancelled or permission was denied.';
            this.cleanupTabAudioCapture(true);
        }
    }

    cleanupTabAudioCapture(stopStream = true) {
        if (stopStream && this.displayStream) {
            this.displayStream.getTracks().forEach((track) => track.stop());
        }

        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor.onaudioprocess = null;
        }

        if (this.audioSource) {
            this.audioSource.disconnect();
        }

        if (this.audioMuteNode) {
            this.audioMuteNode.disconnect();
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
        }

        this.displayStream = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.audioMuteNode = null;
    }

    async stopTabAudioCapture(runAnalysis = true) {
        if (!this.isCapturingTabAudio && !this.displayStream) {
            return;
        }

        const audioStatus = this.container.querySelector('#audioStatus');
        const tabAudioBtn = this.container.querySelector('#tabAudioBtn');
        const sampleRate = this.audioContext ? this.audioContext.sampleRate : 48000;

        this.isCapturingTabAudio = false;
        tabAudioBtn.textContent = 'Share Tab Audio';
        tabAudioBtn.classList.remove('listening');

        this.cleanupTabAudioCapture(true);

        if (!runAnalysis) {
            audioStatus.textContent = 'Tab audio capture stopped.';
            return;
        }

        if (!this.recordedChunks.length) {
            audioStatus.textContent = 'No tab audio was captured.';
            return;
        }

        const wavBlob = this.encodeWav(this.recordedChunks, sampleRate);
        await this.analyzeAudioBlob(wavBlob);
    }

    encodeWav(chunks, sampleRate) {
        const totalSamples = chunks.reduce((count, chunk) => count + chunk.length, 0);
        const buffer = new ArrayBuffer(44 + totalSamples * 2);
        const view = new DataView(buffer);

        const writeString = (offset, text) => {
            for (let index = 0; index < text.length; index += 1) {
                view.setUint8(offset + index, text.charCodeAt(index));
            }
        };

        const writeSample = (offset, sample) => {
            const clamped = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + totalSamples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, totalSamples * 2, true);

        let offset = 44;
        chunks.forEach((chunk) => {
            for (let index = 0; index < chunk.length; index += 1) {
                writeSample(offset, chunk[index]);
                offset += 2;
            }
        });

        return new Blob([view], { type: 'audio/wav' });
    }

    async analyzeAudioBlob(blob) {
        const audioStatus = this.container.querySelector('#audioStatus');

        audioStatus.textContent = 'Transcribing tab audio...';
        this.setResultText('Analyzing audio...');

        try {
            const formData = new FormData();
            formData.append('audio', blob, 'tab-audio.wav');

            const response = await fetch('/api/analyze-audio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Network error');
            }

            const data = await response.json();
            const analysis = data.analysis || {};
            const verdict = analysis.abusive ? 'Abusive' : 'Not abusive';

            this.setResultSummary(verdict, Boolean(analysis.abusive));
            this.setResultText(`Audio result ready: ${verdict} content detected.`);
            audioStatus.textContent = 'Tab audio transcribed.';
        } catch (error) {
            audioStatus.textContent = 'Error while transcribing tab audio.';
            this.setResultText('Error contacting backend while analyzing audio.', true);
        }
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
        this.setResultText('Checking text...');
        try {
            const response = await fetch('/api/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
            const verdict = data.abusive ? 'Abusive' : 'Not abusive';
            this.setResultSummary(verdict, Boolean(data.abusive));
            this.setResultText(`Text analysis complete.`);
        } catch (err) {
            this.setResultText('Error contacting backend.', true);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.className = 'container';
    document.body.appendChild(container);
    new AbuseDetectorUI(container);
});
