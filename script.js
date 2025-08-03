document.addEventListener('DOMContentLoaded', () => {
    // --- Constants and Configuration ---
    // NOTE: API keys are placeholders and should be securely managed.
    // In a real application, these would be injected by a backend or a build process.
    const DEEPGRAM_API_KEY = 'cc186bd29115880294e05418214099ffff5497b8';
    const OPENROUTER_API_KEY = 'cc186bd29115880294e05418214099ffff5497b8';
    const OPENROUTER_MODEL = 'deepseek/deepseek-v2-chat';

    // --- DOM Elements ---
    const orb = document.getElementById('orb');
    const passwordContainer = document.getElementById('password-container');
    const passwordInput = document.getElementById('password-input');
    const passwordSubmit = document.getElementById('password-submit');
    const userCommandDisplay = document.getElementById('user-command');
    const assistantResponseContainer = document.getElementById('assistant-response-container');
    const assistantResponseDisplay = document.getElementById('assistant-response');

    // --- State Variables ---
    let deepgramClient; // The Deepgram SDK client
    let connection;     // The WebSocket connection to Deepgram
    let microphone;     // The MediaRecorder instance for microphone input
    let isListening = false;      // True when the assistant is actively listening
    let spacebarPressed = false;  // True when the spacebar is being held down
    let isLocked = true;          // True when the assistant is locked

    // --- Initialization ---

    /**
     * Initializes the Deepgram client.
     * Handles potential errors if the SDK fails to load or initialize.
     */
    try {
        if (!window.deepgram) {
            throw new Error("Deepgram SDK not loaded.");
        }
        const { createClient } = window.deepgram;
        deepgramClient = createClient(DEEPGRAM_API_KEY);
    } catch (error) {
        console.error("Failed to create Deepgram client:", error);
        displayError("Could not initialize transcription service.");
    }

    /**
     * Requests microphone access from the user and creates a MediaRecorder instance.
     * @returns {Promise<MediaRecorder|null>} A promise that resolves to a MediaRecorder or null if access is denied.
     */
    const getMicrophone = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return new MediaRecorder(stream);
        } catch (error) {
            console.error("Microphone access denied:", error);
            displayError("Microphone access is required to use the assistant.");
            return null;
        }
    };

    /**
     * Initializes the application, checking for API keys and pre-loading the microphone.
     */
    const initialize = () => {
        orb.classList.add('locked');
        displayError("Enter password to unlock.");
    };

    const unlockAssistant = () => {
        const password = passwordInput.value;
        if (password === '123123') {
            isLocked = false;
            orb.classList.remove('locked');
            passwordContainer.style.display = 'none';
            // Asynchronously get microphone access when the page loads.
            getMicrophone().then(mic => {
                if (mic) {
                    microphone = mic;
                    orb.classList.add('ready');
                    displayError("Hold spacebar to talk."); // Initial prompt
                    setTimeout(() => resetUI(true), 3000);
                }
                // If mic is null, getMicrophone() already displayed an error.
            });
        } else {
            orb.classList.add('disturbed');
            setTimeout(() => {
                orb.classList.remove('disturbed');
            }, 300);
            displayError("Incorrect password.");
            passwordInput.value = '';
        }
    };

    // --- Core Functions ---

    /**
     * Starts the listening process by connecting to Deepgram and capturing microphone input.
     */
    const startListening = async () => {
        if (isListening || !spacebarPressed) return;

        // Ensure we have a microphone
        if (!microphone) {
            microphone = await getMicrophone();
            if (!microphone) {
                // The getMicrophone function will have already displayed an error
                spacebarPressed = false; // Reset spacebar state
                return;
            }
        }

        isListening = true;
        orb.classList.remove('ready');
        orb.classList.add('listening');
        userCommandDisplay.textContent = 'Listening...';
        userCommandDisplay.style.opacity = '1';
        assistantResponseContainer.style.opacity = '0';

        try {
            // Ensure Deepgram client is ready
            if (!deepgramClient) {
                throw new Error("Deepgram client not initialized.");
            }

            // Create a new live transcription connection
            connection = deepgramClient.listen.live({
                model: 'nova-2',
                smart_format: true,
                interim_results: true, // Get transcripts as the user speaks
            });
        } catch (error) {
            console.error("Error creating Deepgram connection:", error);
            displayError("Could not start transcription service.");
            resetUI();
            return;
        }

        // Handle the connection opening
        connection.on('open', () => {
            if (microphone.state === 'inactive') {
                microphone.start(500); // Start recording, sending data every 500ms
            }
            microphone.ondataavailable = (event) => {
                if (event.data.size > 0 && connection) {
                    connection.send(event.data);
                }
            };
        });

        // Handle incoming transcripts
        connection.on('transcript', (data) => {
            const transcript = data.channel.alternatives[0].transcript;
            if (transcript) {
                userCommandDisplay.textContent = transcript;
            }
            // When we get a final transcript, stop listening and process it.
            if (data.is_final && transcript.trim()) {
                stopListening(transcript);
            }
        });

        // Handle the connection closing
        connection.on('close', () => {
            console.log('Deepgram connection closed.');
            resetUI(!userCommandDisplay.textContent || userCommandDisplay.textContent === 'Listening...');
        });

        // Handle any errors from the connection
        connection.on('error', (error) => {
            console.error('Deepgram error:', error);
            displayError("An error occurred during transcription.");
            resetUI();
        });
    };

    /**
     * Stops the listening process, finalizes the Deepgram connection, and handles the final transcript.
     * @param {string} [finalTranscript] - The final transcript received from Deepgram.
     */
    const stopListening = (finalTranscript) => {
        if (connection) {
            connection.finish();
            connection = null;
        }
        if (microphone && microphone.state !== 'inactive') {
            microphone.stop();
        }

        isListening = false;
        spacebarPressed = false;
        orb.classList.remove('listening');

        if (finalTranscript) {
            handleTranscript(finalTranscript);
        } else if (userCommandDisplay.textContent === 'Listening...') {
            // Handle cases where listening was stopped but no speech was detected.
            displayError("I didn't catch that.");
            resetUI(true);
        }
    };

    /**
     * Processes the final transcript by sending it to the AI and displaying the response.
     * @param {string} transcript - The final text transcript from speech-to-text.
     */
    const handleTranscript = async (transcript) => {
        if (!transcript.trim()) {
            displayError("I didn’t catch that. Please try again.");
            resetUI(true);
            return;
        }

        userCommandDisplay.textContent = transcript;

        try {
            const response = await getAIResponse(transcript);
            if (response && response.trim()) {
                displayAssistantResponse(response);
            } else {
                displayError("I'm not sure how to respond to that.");
            }
        } catch (error) {
            console.error("Error in handleTranscript:", error);
        } finally {
            resetUI(false); // Keep the transcript and response visible
        }
    };

    /**
     * Sends the transcript to OpenRouter to get an AI-generated response.
     * @param {string} transcript - The user's command.
     * @returns {Promise<string|null>} A promise that resolves to the AI's response text or null on failure.
     */
    const getAIResponse = async (transcript) => {
        orb.classList.add('responding');
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "HTTP-Referer": `${window.location.protocol}//${window.location.host}`, // Required by some models
                },
                body: JSON.stringify({
                    model: OPENROUTER_MODEL,
                    messages: [{ role: "user", content: transcript }],
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            console.error("Error fetching from OpenRouter:", error);
            displayError("I'm having trouble connecting to my brain.");
            return null;
        } finally {
            orb.classList.remove('responding');
        }
    };

    // --- UI and Helper Functions ---

    /**
     * Displays the assistant's response in the UI.
     * @param {string} response - The text to display.
     */
    const displayAssistantResponse = (response) => {
        assistantResponseDisplay.textContent = response;
        assistantResponseContainer.style.opacity = '1';
    };

    /**
     * Displays an error message in the UI.
     * @param {string} message - The error message to display.
     */
    const displayError = (message) => {
        userCommandDisplay.textContent = message;
        userCommandDisplay.style.opacity = '1';
    };

    /**
     * Resets the UI to its idle state.
     * @param {boolean} [hideCommand=true] - If true, fades out the command/response area.
     */
    const resetUI = (hideCommand = true) => {
        isListening = false;
        spacebarPressed = false;
        orb.classList.remove('listening', 'responding');
        orb.classList.add('ready'); // Return to ready state

        if (hideCommand) {
            // After a delay, fade out the text areas for a cleaner look.
            setTimeout(() => {
                userCommandDisplay.style.opacity = '0';
                assistantResponseContainer.style.opacity = '0';
                 // Clear content after fading out
                userCommandDisplay.textContent = '';
                assistantResponseDisplay.textContent = '';
            }, 3000);
        }
    };

    // --- Event Listeners ---

    // Initialize the application when the DOM is ready.
    initialize();

    passwordSubmit.addEventListener('click', unlockAssistant);
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            unlockAssistant();
        }
    });

    // Listen for spacebar press to start listening.
    window.addEventListener('keydown', (e) => {
        if (isLocked) return;

        if (e.code === 'Space' && !spacebarPressed) {
            e.preventDefault();
            spacebarPressed = true;
            startListening();
        }
    });

    // Listen for spacebar release to stop listening.
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && isListening) {
            e.preventDefault();
            stopListening(); // Will either handle a timeout or be ignored if final transcript is processing
        }
    });
});
