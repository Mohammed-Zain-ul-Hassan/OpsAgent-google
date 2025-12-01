import { useState, useEffect, useCallback, useRef } from 'react';

export function useVoice() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);

    // 1. LOAD VOICES (Chrome requires waiting for this event)
    useEffect(() => {
        const loadVoices = () => {
            const available = window.speechSynthesis.getVoices();
            setVoices(available);
        };

        loadVoices();
        // Chrome loads voices async, so we must listen for the change event
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }, []);

    // 2. SPEECH RECOGNITION (Listening)
    const startListening = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Browser does not support Speech Recognition.");
            return;
        }

        // Stop any existing instance
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true; // Keep listening while held
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            // Get the latest result from the array
            const lastResultIndex = event.results.length - 1;
            const text = event.results[lastResultIndex][0].transcript;
            setTranscript(text);
        };

        recognition.onend = () => setIsListening(false);

        recognition.start();
        recognitionRef.current = recognition;
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    // 3. TEXT TO SPEECH (Speaking)
    const speak = useCallback((text: string) => {
        // Cancel any current speech to avoid overlapping
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a good robotic voice
        // Priority: "Google US English" -> "Daniel" -> First available
        const preferredVoice = voices.find(v => v.name.includes("Google US English")) ||
            voices.find(v => v.name.includes("Daniel")) ||
            voices[0];

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        console.log(`🔊 Speaking: "${text}" using voice: ${preferredVoice?.name}`);
        window.speechSynthesis.speak(utterance);
    }, [voices]);

    return { isListening, transcript, startListening, stopListening, speak, setTranscript };
}
