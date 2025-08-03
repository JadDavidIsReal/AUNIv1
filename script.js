document.addEventListener('DOMContentLoaded', () => {
    const orb = document.getElementById('orb');
    const userCommandDisplay = document.getElementById('user-command');
    const assistantResponseContainer = document.getElementById('assistant-response-container');
    const assistantResponseDisplay = document.getElementById('assistant-response');

    let isListening = false;
    let spacebarPressed = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = true;

        recognition.onstart = () => {
            isListening = true;
            orb.classList.add('listening');
            userCommandDisplay.textContent = 'Listening...';
            userCommandDisplay.style.opacity = '1';
            assistantResponseContainer.style.opacity = '0';
        };

        recognition.onend = () => {
            isListening = false;
            spacebarPressed = false;
            orb.classList.remove('listening');
            if (userCommandDisplay.textContent === 'Listening...') {
                userCommandDisplay.style.opacity = '0';
            }
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0])
                .map(result => result.transcript)
                .join('');

            userCommandDisplay.textContent = transcript;

            if (event.results[0].isFinal) {
                processCommand(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            userCommandDisplay.textContent = 'Sorry, I had trouble hearing. Please try again.';
            setTimeout(() => {
                userCommandDisplay.style.opacity = '0';
            }, 3000);
        };

    } else {
        alert('Speech Recognition API not supported in this browser.');
    }

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isListening && !spacebarPressed) {
            e.preventDefault();
            spacebarPressed = true;
            try {
                recognition.start();
            } catch (error) {
                console.error("Recognition could not be started:", error);
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && isListening) {
            e.preventDefault();
            recognition.stop();
        }
    });

    function processCommand(command) {
        orb.classList.add('responding');
        setTimeout(() => orb.classList.remove('responding'), 1200);

        let response = `I received the command: "${command}"`;

        // Simple command simulation
        if (command.toLowerCase().includes('open google calendar')) {
            response = 'Opening Google Calendar...';
        } else if (command.toLowerCase().includes('what time is it')) {
            const now = new Date();
            response = `The current time is ${now.toLocaleTimeString()}.`;
        } else if (command.toLowerCase().includes('hello')) {
            response = 'Hello! How can I assist you today?';
        }

        displayAssistantResponse(response);
    }

    function displayAssistantResponse(response) {
        assistantResponseDisplay.textContent = response;
        assistantResponseContainer.style.opacity = '1';
    }
});
